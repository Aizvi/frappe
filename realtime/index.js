const { Server } = require("socket.io");

const { get_conf, get_redis_subscriber } = require("../node_utils");
const conf = get_conf();

let io = new Server(conf.socketio_port, {
	cors: {
		// Should be fine since we are ensuring whether hostname and origin are same before adding setting listeners for s socket
		origin: true,
		credentials: true,
	},
});

// Multitenancy implementation.
// allow arbitrary sitename as namespaces
// namespaces get validated during authentication.
const realtime = io.of(/^\/.*$/);

// load and register middlewares
const authenticate = require("./middlewares/authenticate");
realtime.use(authenticate);
// =======================

// load and register handlers
const frappe_handlers = require("./handlers/frappe_handlers");
function on_connection(socket) {
	frappe_handlers(realtime, socket);

	// ESBUild "open in editor" on error
	socket.on("open_in_editor", (data) => {
		subscriber.publish("open_in_editor", JSON.stringify(data));
	});
}

realtime.on("connection", on_connection);
// =======================

// Consume events sent from python via redis pub-sub channel.
const subscriber = get_redis_subscriber();

subscriber.on("message", function (_channel, message) {
	message = JSON.parse(message);

	let namespace = "/" + message.namespace;
	if (message.room) {
		io.of(namespace).to(message.room).emit(message.event, message.message);
	} else {
		// publish to ALL sites only used for things like build event.
		realtime.emit(message.event, message.message);
	}
});

subscriber.subscribe("events");
// =======================
