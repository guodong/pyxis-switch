var url = require('url');
var dgram = require('dgram');
var WebSocketServer = require('ws').Server;
const EventEmitter = require('events');

var udpServer;

class Backend extends EventEmitter {
  constructor(port, address) {
    super();
    this.port = port;
    this.address = address;
  }

  send(msg) {
    udpServer.send(msg, this.port, this.address, (err) => {
      if (err)
        console.log('error: send to udp server');
    });
  }
}

function createWebsocketServer() {
  var wss = new WebSocketServer({port: 9000});

  wss.on('connection', function connection(ws) {
    /* get info from query string */
    ws.upgradeReq.url
    var info = url.parse(ws.upgradeReq.url, true);
    var token = info.query.token;
    if (info.query.type == 'server') {
      registerServerPoint(token, ws);
    } else {
      registerClientPoint(token, ws);
    }
  });
}

function createUDPServer() {
  var udpPort = 9000;
  udpServer = dgram.createSocket('udp4');
  udpServer.bind(udpPort);

  udpServer.on('listening', function(){
    console.log('UDP server started at ', udpPort);
  });

  udpServer.on('message', function(msg, info){

    var pair = findPairByUDPInfo(info);
    if (!pair) {
      if (msg.length !== 100) { //TODO: check if is info message
        return;
      }
      var buf = msg.slice(0, msg.indexOf(0));
      var name = buf.toString();
      console.log('backend name: ', name, info.port, info.address);
      var backend = new Backend(info.port, info.address);
      registerServerPoint(name, backend);
    } else {
      if (msg.length === 100) { //TODO: check if is info message
        return;
      }
      pair.backend.emit('message', msg);
    }

  });

  udpServer.on('error', function(){
    console.log('udp server error');
  });

}

var pairs = [];
function findPair(name) {
  for (var i in pairs) {
    if (pairs[i].name == name) {
      return pairs[i];
    }
  }
  return null;
}

function findPairByUDPInfo(info) {
  for (var i in pairs) {
    if (pairs[i].backend) {
      if (pairs[i].backend.port === info.port && pairs[i].backend.address === info.address) {
        return pairs[i];
      }
    }
  }
  return null;
}

function registerClientPoint(name, point) {
  var pair = findPair(name);
  if (!pair) {
    pair = {
      name: name,
      frontend: point,
      backend: null
    };
    pairs.push(pair);
  } else {
    pair.frontend = point;
  }
  startPair(pair);
}

function registerServerPoint(name, point) {
  var pair = findPair(name);
  if (!pair) {
    pair = {
      name: name,
      frontend: null,
      backend: point
    };
    pairs.push(pair);
  } else {

    pair.backend = point;
  }
  startPair(pair);
}

function startPair(pair) {
  if (pair.frontend && pair.backend) {
    pair.frontend.removeAllListeners('message');
    pair.backend.removeAllListeners('message');
    pair.frontend.on('message', pair.backend.send.bind(pair.backend));
    pair.backend.on('message', (msg) => {
        if (pair.frontend.readyState == 1) {
          pair.frontend.send(msg);
        }
    });
  }
}

createWebsocketServer();
createUDPServer();
