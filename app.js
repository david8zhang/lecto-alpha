// idk what this does
var path = require('path')

//Initialize Express
var express = require('express');
var app = express();
var server = require('http').createServer(app);

//Initialize Socket.io
var io = require('socket.io')(server);

//Other middleware needed to configure passport
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var expressSession = require('express-session');

//Passport module
var passport = require('passport');
var passportLocal = require('passport-local')

//AWS packages use with DynamoDB
var AWS = require('aws-sdk');
var s3 = new AWS.S3();
var DOC = require('dynamodb-doc');
AWS.config.update({region: 'us-west-2'});
var docClient = new DOC.DynamoDB();
var dynamodb = new AWS.DynamoDB();

//test rooms hardcoded
var rooms = ['room1', 'room2', 'room3'];
var usernames = {};

//Set the view engine
app.set('view engine', 'ejs');

//Use the other middleware
app.use(bodyParser.urlencoded({extended: false }));
app.use(cookieParser());
app.use(expressSession({ secret: 'secret', 
		resave: false,
		saveUninitialized:false
	}));

//Register passport middleware
app.use(passport.initialize());
app.use(passport.session());

/****************************PASSPORT AUTHENTICATION STRATEGY**************************/

//Define passport authentication strategy here
passport.use(new passportLocal.Strategy(function(username, password, done){
	var queryParams = {};
	queryParams.TableName = 'lecto-teachers';
	queryParams.KeyConditions = [docClient.Condition('username', 'EQ', username)];
	queryParams.QueryFilter = docClient.Condition('password', 'EQ', password);
	docClient.query(queryParams, function(err, result){
		if(err){
			done(new Error('Oh Shit!'));
			console.log(err, err.stack)
		} else {
			jsonString = JSON.parse(JSON.stringify(result))
			if(jsonString["Count"] == 0){
				done(null, null)
			} else {
				done(null, {id: username, name: jsonString["Items"].username});
			}
		}
	})
})); 

passport.serializeUser(function(user, done){
	done(null, user.id)
})

passport.deserializeUser(function(id, done){
	//Query the database or cache here
	done(null, {id: id, name: id})
})


/**********************************ROUTES**********************************/
//Get the homepage
app.get('/', function(req, res){
	res.render('index');
});

//Get the login page
app.get('/login', function(req, res){
	res.render('login');
});

//Get the logout page
app.get('/logout', function(req, res){
	req.logout();
	res.redirect('/')
});


//Get the classes page
app.get('/classes', function(req, res){
	res.render('classes');
});

//get the registration page
app.get('/register', function(req, res){
	res.render('register')
});

//Get the dashboard
app.get('/dashboard', function(req, res){
	res.render('dashboard', {
		isAuthenticated: req.isAuthenticated(),
		username: req.user.name
	})
})

//Get the new session page
app.get('/session', function(req, res){
	res.render('session',{
		username: req.user.name
	});
})

//post registration information
app.post('/register', function(req, res){
	username = req.body.name;
	password = req.body.pass;

	register(username, password)
	res.redirect('/')
});

//Post login information
app.post('/login', passport.authenticate('local'), function(req, res){
	res.redirect('/dashboard')
});

//Post the new session information
app.post('/newsession', function(req, res){
	res.redirect('/')
});


/*********************************SOCKET IO*************************************/
io.sockets.on('connection', function (socket){
	// socket.on('adduser', function(username){

	// 	//store the username in the socket session
	// 	socket.username = username; 

	// 	//Store this room in the socket session
	// 	socket.room = 'room1';

	// 	//store the client's username to the global list
	// 	usernames[username] = username;

	// 	//Send client to room 1
	// 	socket.join('room1');

	// 	//echo to the client that they've connected
	// 	socket.emit('updatechat', 'SERVER', 'you have connected to room1');

	// 	//echo to room 1 that a person has connected to their room
	// 	socket.broadcast.to('room1').emit('updatechat', 'SERVER', username + ' has connected to this room');
	// 	socket.emit('updaterooms', rooms, 'room1');

	// })

	// //Sending chats
	// socket.on('sendchat', function (data){
	// 	//we tell the client to execute 'updatechat' with 2 parameters
	// 	io.sockets.in(socket.room).emit('updatechat', socket.username, data);
	// });

	// //switching to a new room
	// socket.on('switchRoom', function(newroom)){
	// 	socket.leave(socket.room);
		
	// 	//Join the new room specified by the client
	// 	socket.join(newroom)

	// 	//Send a message to the old room that the user has left
	// 	socket.broadcast.to(socket.room).emit('updatechat', 'SERVER', socket.username + ' has left this room')
	// 	socket.emit('updaterooms', rooms, newroom);
	// }

	// //When the user disconnects.. perform this
	// socket.on('disconnect', function(){
	// 	//remove the username from the global usernames list
	// 	delete usernames[socket.username];
	// 	//update list of users in chat
	// 	io.sockets.emit('updateusers', usernames);
	// 	//echo globally that this client has left
	// 	socket.broadcast.emit('updatechat', 'SERVER', socket.username + ' has disconnected');
	// 	socket.leave(socket.room)
	// });
});

/*********************************FUNCTIONS**************************************/
function register(username, password){
	var params = {};
	params.TableName = 'lecto-teachers';

	//Add more parameters later (comments, reviews)
	params.Item = {username: username, password: password};
	docClient.putItem(params, function(err, data){
		if(err){
			console.log(err, err.stack)
		} else {
			console.log("Account successfully created!");
		}
	})
}

//Load external assets for front-end
app.use(express.static(__dirname + '/public'));

//Use bower components(JQuery)
app.use(express.static(__dirname + 'bower_components'));

//Initialize the server
console.log('server listening on port 5400');
server.listen(5400);
