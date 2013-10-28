Array.prototype.remove = function(e) {
	for (var i = 0; i < this.length; i++) {
		if (e == this[i]) { return this.splice(i, 1); }
	}
};
Object.prototype.values = function(x) {
	var l = [],obj=this;
	Object.keys(this).forEach(function(v) {
		l.push(obj[v]);
	});
	return l;
}

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

var DEBUG = 2;
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
var BackupTimeout, BackupCounter = 0;

var rooms = {}; // store 
if(fs.existsSync('backup.json')) {
	rooms = JSON.parse(fs.readFileSync('backup.json'));
	Object.keys(rooms).forEach(function(room){
		rooms[room]['locks'] = {};
	});
	console.log("### loaded Backup! ###", "\t", new Date());
	if(DEBUG>3) console.log(rooms);
}


////////////////////////////////////////////////////////////////////////
var checkId = function(id) {
	var y,x = id.split(":");
	y=parseInt(x[1], 10), x=parseInt(x[0], 10);
	if(y>=0 && y<26 && x>=0 && x<8) return x+":"+y;
}
var lockexists = function(obj, id) {
	var b = false;
	Object.keys(obj).forEach(function(v) {
		if(id==obj[v]) b = true;
	});
	return b;
}
var backup = function() {
	BackupCounter = 0;
	if(DEBUG>2) console.log('### Backup started! ###',"\t" ,new Date());
	fs.writeFile('backup.json', JSON.stringify(rooms), function (err) {
		if (err) throw err;
		if(DEBUG>1) console.log('### Backup created! ###',"\t" ,new Date());
	});
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
			cc.emit("initiallocks", rooms[room]["locks"].values() );
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
		if(DEBUG>2) console.log(rooms[room]["locks"]);
	});
	cc.on("unlock", function(id){
		if(rooms[room]["locks"][cc.id]!=id) return;
		delete rooms[room]["locks"][cc.id]
		cc.broadcast.to(room).emit("unlock", id);
		if(DEBUG>2) console.log(rooms[room]["locks"]);
	});
	cc.on("update", function(data){
		if(rooms[room]["locks"][cc.id]!=data.id) return;
		//data.data = sanitize(data.data).entityEncode();
		data.data = sanitize(data.data).escape();
		data.data = sanitize(data.data).xss();
		data.data = data.data.replace(/&lt;.+?&gt;/g, "").replace(/&amp;nbsp;/g, " ");  // hide shit
		rooms[room]["data"][data.id] = data.data;
		cc.broadcast.to(room).emit("update", data);
		delete rooms[room]["locks"][cc.id]; // free lock
		if(DEBUG>2) console.log(rooms[room]["locks"]);
		
		if(BackupTimeout) {
			clearTimeout(BackupTimeout);
			BackupCounter++;
		}
		if(BackupCounter>49) backup();
			else BackupTimeout = setTimeout(backup, 10*1000);
		
	});
	cc.on('disconnect',function(){
		if(rooms[room]["locks"][cc.id]) {
			cc.broadcast.to(room).emit("unlock", rooms[room]["locks"][cc.id]);
			delete rooms[room]["locks"][cc.id];
			if(DEBUG>2) console.log(rooms[room]["locks"]);
		}
		io.sockets.in(room).emit( 'clients', io.sockets.clients(room).length-1 );
		console.log("Clients in \""+room+"\": ", io.sockets.clients(room).length-1, "\t", new Date() );
	});
});
