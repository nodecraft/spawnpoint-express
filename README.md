# Spawnpoint-express
[Express](http://expressjs.com/) Plugin for [Spawnpoint](https://github.com/nodecraft/spawnpoint).

[![npm version](https://badge.fury.io/js/spawnpoint-express.svg)](https://badge.fury.io/js/spawnpoint-express)
[![dependencies Status](https://david-dm.org/nodecraft/spawnpoint-express/status.svg)](https://david-dm.org/nodecraft/spawnpoint-express)
[![Build Status](https://travis-ci.org/nodecraft/spawnpoint-express.svg?branch=master)](https://travis-ci.org/nodecraft/spawnpoint-express)
[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2Fnodecraft%2Fspawnpoint-express.svg?type=shield)](https://app.fossa.io/projects/git%2Bgithub.com%2Fnodecraft%2Fspawnpoint-express?ref=badge_shield)

## API
This api is mounted at `app.server` as a new express app. Also mounts `app.joi` for validation. Has following methods:

##### `app.server.validate(fields)`
Middleware to validate fields on requests.
 - `fields` *object* - Key value where key is fieldname and value is joi validation object

```javascript

app.server.post('/validate', app.server.validate({
        body: {
            user: app.joi.string().required(),
            email: app.joi.string().email(),
        }
    }), function(req, res){
        if(req.body.user.length < 2){
            return res.invalid({
                'user': app.code('user.username_invalid') // this code is not included
            });
        }
        res.success('server.status_200', req.body);
    });

// outputs
{
    "code": "server.validation",
    "message": "There was a problem with your request. Please check the errors provided.",
    "success": false,
    "data": {
    "fields": {
        "user": {
            "type": "custom_message",
            "message": "Provided username is invalid."
        }
    }
    },
    "error": false
}
```
##### `response.invalid(fields)`
Throws a validation error on the fields.
 - `fields` *object* - Key value where key is fieldname and value is string error or app.code object

```javascript
res.invalid({
    user: 'Provided username is invalid.'
});

// outputs
{
    "code": "server.validation",
    "message": "There was a problem with your request. Please check the errors provided.",
    "success": false,
    "data": {
    "fields": {
        "user": {
            "type": "custom_message",
            "message": "Provided username is invalid."
        }
    }
    },
    "error": false
}
```
##### `response.fail(error [, data])`
Outputs JSON object with code, message, and optional data.
 - `error` *mixed* - This corresponds an error code string, error code object, errorCode Spawnpoint Error, failCode Spawnpoint Error, or registered error from within Spawnpoint.
 - `data` *any* - This is attached to the JSON reply as `response.data`

```javascript
if(user === null){
    var error = app.failCode('user.not_found');
}
res.fail(error);

// outputs
{
    success: false,
    error: false,
    code: "user.not_found",
    message: "No user found by given id.",
    data: null
}

##### `response.success(code [, data])`
Outputs JSON object with code, message, and optional data.
 - `code` *string* - This corresponds with an Spawnpoint code to populate response
 - `data` *any* - This is attached to the JSON reply as `response.data`

```javascript
res.success('user.found', {user: user});

// outputs
{
    success: true,
    code: "user.found",
    message: "The user was found by given id.",
    data: {
        user: {...}
    }
}
```
##### `response.fail(error [, data])`
Outputs JSON object with code, message, and optional data.
 - `error` *mixed* - This corresponds an error code string, error code object, errorCode Spawnpoint Error, failCode Spawnpoint Error, or registered error from within Spawnpoint.
 - `data` *any* - This is attached to the JSON reply as `response.data`

```javascript
if(user === null){
    var error = app.failCode('user.not_found');
}
res.fail(error);

// outputs
{
    success: false,
    error: false,
    code: "user.not_found",
    message: "No user found by given id.",
    data: null
}
```

### Config `server.json5`
- `host` *String* - HTTP server host address to bind on. Defaults to **127.0.0.1**.
- `port` *String* - HTTP server port number to bind on. Defaults to **8080**.
- `handle_error` *Boolean* - Automatically handle internal errors and 404 with generic JSON response codes. Defaults to **True**
