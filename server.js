Array.prototype.remove = function(e) {
  for (var i = 0; i < this.length; i++) {
    if (e == this[i]) { return this.splice(i, 1); }
  }
};

var app = require('http').createServer(function  (req, res) {
	fs.readFile(__dirname + '/foo.html', 'utf8', function (err, data) {
		if (err) {
			res.writeHead(500);
			return res.end('Error loading file');
		}
		res.writeHead(200);
		res.end(data);
	});
});

var sanitize = require('validator').sanitize;
var fs = require('fs');
var io = require('socket.io').listen(app);
io.configure(function () {
	io.set("transports", ['websocket', 'xhr-polling']);
	//io.set("transports", ['xhr-polling']);
	io.set("polling duration", 10);
});


var port = process.env.PORT || parseInt(process.argv[2]) || 1337;
app.listen(port);
io.set('log level', 1);

var clients = 0;

var rooms = {}; // store 

////////////////////////////////////////////////////////////////////////
var checkId = function(id) {
	var y,x = id.split(":");
	y=parseInt(x[1], 10), x=parseInt(x[0], 10);
	if(y>=0 && y<26 && x>=0 && x<8) return x+":"+y;
}
var objValues = function(obj) {
	var l = [];
	Object.keys(obj).forEach(function(v) {
		if(obj.hasOwnProperty(v)) l.push(obj[v]);
	});
	return l;
}
var lockexists = function(obj, id) {
	var b = false;
	Object.keys(obj).forEach(function(v) {
		if(id==obj[v]) b = true;
	});
	return b;
}
////////////////////////////////////////////////////////////////////////

io.sockets.on('connection', function (cc) {
	var room = "", lock="";
	cc.on('room', function(data){
		room = String(data);
		cc.join(room);
		if(rooms[room]==undefined) rooms[room] = {"locks":{},"data":{}};
		
		io.sockets.in(room).emit( "clients", io.sockets.clients(room).length );
		console.log("Clients in \""+room+"\": ", io.sockets.clients(room).length, "\t", new Date() );
		
		if(rooms[room]) {
			cc.emit("initialupdate", rooms[room]["data"]);
			cc.emit("initiallocks", objValues(rooms[room]["locks"]) );
		}
	});
	cc.on("lock", function(id){
		//io.sockets.in(room).emit("lock", id);
		id = checkId(id);
		if(!id) return;
		if( rooms[room]["locks"][cc.id] ) return;  // just one lock per client!
		if( lockexists( rooms[room]["locks"],id ) ) return;  // dont overwrite locks
		rooms[room]["locks"][cc.id] = id;
		cc.broadcast.to(room).emit("lock", id); //emit to 'room' except this socket
	});
	cc.on("unlock", function(id){
		if(rooms[room]["locks"][cc.id]!=id) return;
		delete rooms[room]["locks"][cc.id]
		cc.broadcast.to(room).emit("unlock", id);
	});
	cc.on("update", function(data){
		if(rooms[room]["locks"][cc.id]!=data.id) return;
		//data.data = sanitize(data.data).entityEncode();
		data.data = sanitize(data.data).escape();
		data.data = sanitize(data.data).xss();
		rooms[room]["data"][data.id] = data.data;
		cc.broadcast.to(room).emit("update", data);
		delete rooms[room]["locks"][cc.id]; // free lock
	});
	cc.on('disconnect',function(){
		if(rooms[room]["locks"][cc.id]) {
			cc.broadcast.to(room).emit("unlock", rooms[room]["locks"][cc.id]);
			delete rooms[room]["locks"][cc.id];
		}
		io.sockets.in(room).emit( 'clients', io.sockets.clients(room).length-1 );
		console.log("Clients in \""+room+"\": ", io.sockets.clients(room).length-1, "\t", new Date() );
	});
});
