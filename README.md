# appframe-express
[Express](http://expressjs.com/) Plugin for [Appframe](https://github.com/nodecraft/appframe.js) on NPM. This currently does not support SSL.

## TODO:
 - Implement Joi Validation helpers
 - Handle shutdown more gracefully. (clients are interupted and connections are closed currently)

## API
This api is mounted at `app.server` as a new express app. This module also adds the following methods:

##### `response.success(code [, data])`
Outputs JSON object with code, message, and optional data.
 - `code` *string* - This corresponds with an appframe code to populate response
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
 - `error` *mixed* - This corresponds an error code string, error code object, errorCode appframe Error, failCode appframe Error, or registered error from within appframe.
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
