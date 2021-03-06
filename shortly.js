var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var session = require('express-session');
var bcrypt = require('bcrypt-nodejs');
var passport = require('passport');
var config = require('./oauth');
var GithubStrategy = require('passport-github2').Strategy;


var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

// setup passport session
passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

passport.use(new GithubStrategy({
  clientID: config.github.clientID,
  clientSecret: config.github.clientSecret,
  callbackURL: config.github.callbackURL
}, function(accessToken, refreshToken, profile, done) {
  process.nextTick(function() {
    return done(null, profile);
  });
}));

// Simple route middleware to ensure user is authenticated.
//   Use this route middleware on any resource that needs to be protected.  If
//   the request is authenticated (typically via a persistent login session),
//   the request will proceed.  Otherwise, the user will be redirected to the
//   login page.
var ensureAuthenticated = function (req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/login');
};


var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));
// Add session
app.use(session({secret: 'apple'}));
// Initialize Passport!  Also use passport.session() middleware, to support
// persistent login sessions (recommended).
app.use(passport.initialize());
app.use(passport.session());


app.get('/', ensureAuthenticated, function(req, res) {
  // util.checkUser(req, res, function() {
  //   res.render('index');
  // });
  res.render('index');
});

app.get('/create', ensureAuthenticated, function(req, res) {
  // util.checkUser(req, res, function() {
  //   res.render('index');
  // });
  res.render('index');
});

app.get('/links', ensureAuthenticated, function(req, res) {
  // util.checkUser(req, res, function() {
  //   Links.reset().fetch().then(function(links) {
  //     res.status(200).send(links.models);
  //   });
  // });
  Links.reset().fetch().then(function(links) {
    res.status(200).send(links.models);
  });
});

app.post('/links', function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.sendStatus(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.status(200).send(found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.sendStatus(404);
        }

        Links.create({
          url: uri,
          title: title,
          baseUrl: req.headers.origin
        })
        .then(function(newLink) {
          res.status(200).send(newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/

// app.post('/signup', function(req, res) {
//   var sess = req.session;
//   var salt = bcrypt.genSaltSync();
//   var username = req.body.username;
//   var password = req.body.password;
  
//   // hash the password
//   password = bcrypt.hashSync(password, salt);
//   console.log('salt: ' + salt);
//   console.log('password: ' + password);

//   Users.create({
//     username: username,
//     password: password,
//     salt: salt
//   })
//   .then(function(newUser) {
//     sess.username = username;
//     res.redirect('/');
//   });
// });

// app.post('/login', function(req, res) {
//   var sess = req.session;

//   var username = req.body.username;
//   var password = req.body.password;

//   Users.query({where: {username: username}})
//     .fetchOne()
//     .then(function(model) {
//       if (model) {
//         var salt = model.attributes.salt;
//         var passwordHash = model.attributes.password;
//         var newPasswordHash = bcrypt.hashSync(password, salt);
//         if (passwordHash === newPasswordHash) {
//           sess.username = username;
//           res.redirect('/');
//         } else {
//           res.redirect('/login');
//         }
//       } else {
//         res.redirect('/login');
//       }
//     })
//     .catch(function(err) {
//       throw {
//         type: 'LoginError',
//         message: 'Failed to login properly'
//       };
//     });
// });

app.get('/login', function(req, res) {
  res.render('login');
});

app.get('/signup', function(req, res) {
  res.render('signup');
});

app.get('/logout', function(req, res) {
  // req.session.destroy(function(error, success) {
  //   if (error) {
  //     console.log('Session not destroyed!');
  //   } else {
  //     res.redirect('/login');
  //   }
  // });
  req.session.destroy(function() {
    req.logout();
    res.redirect('/login');
  });
});

// GET /auth/github
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in GitHub authentication will involve redirecting
//   the user to github.com.  After authorization, GitHub will redirect the user
//   back to this application at /auth/github/callback
app.get('/auth/github',
  passport.authenticate('github', { scope: [ 'user:email' ] }),
  function(req, res) {
    // The request will be redirected to GitHub for authentication, so this
    // function will not be called.
  });

// GET /auth/github/callback
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function will be called,
//   which, in this example, will redirect the user to the home page.
app.get('/auth/github/callback', 
  passport.authenticate('github', { failureRedirect: '/login' }),
  function(req, res) {
    res.redirect('/');
  });


/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        linkId: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits') + 1);
        link.save().then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
