import * as dotenv from 'dotenv';
import express from 'express';
import { Mongoose } from 'mongoose';
import {StatusCodes} from 'http-status-codes';

// Security
import cors from 'cors';
import cookieParser from 'cookie-parser';
import csrf from 'csurf';
import { rateLimit } from 'express-rate-limit';
import MongoStore from 'rate-limit-mongo';

// Services
import AuthService from './middleware/auth-service.js';

import makeUserModel from './models/user-model.js';
import makeRefreshTokenModel from './models/token-model.js';
import UserDao from './dao/user-dao.js';
import TokenDao from './dao/token-dao.js';
import UserService from './middleware/user-service.js';

// Routers
import makeUserRouter from './routers/user-router.js';
import UserValidator from './middleware/validator/user-validator.js';
import {ServerError} from './errors/server-error.js';
import {NotFoundError} from './errors/not-found-error.js';

// Load Environment Variables from .env.production
dotenv.config({path: `config/.env.${process.env.NODE_ENV}`});

// Express handles HTTP Requests and responses
const app = express();
const port = process.env.PORT || 3000;
const mongoose = new Mongoose();

app.use(express.json());
app.use(cors({
    origin: process.env.CLIENT_URL,
    credentials: true
}));
app.use(
    express.urlencoded({
        extended: true,
    })
);
app.use(cookieParser(process.env.COOKIE_PARSER_SECRET));

// JWT Refresh Token Middleware
const refreshTokenModel = makeRefreshTokenModel(mongoose);
const refreshTokenDAO = new TokenDao(refreshTokenModel);

// User Middleware
const userModel = makeUserModel(mongoose);
const userDao = new UserDao(userModel);
const userService = new UserService(userDao);
const userValidator = new UserValidator(userService);

// Security
const authService = new AuthService(refreshTokenDAO);
const csrfProtection = csrf({ cookie: {
        httpOnly: true,
        secure: true,
        signed: true,
        sameSite: 'strict',
    }});

// TODO: Change Limiter
const limiter = rateLimit({
    store: new MongoStore({
        uri: process.env.DB_URL + 'rate-limit',
        expireTimeMs: 15 * 60 * 1000, // should match windowMs
        errorHandler: console.error.bind(null, 'rate-limit-mongo'),
        keyGenerator: function(req) {
            return req.user._id
        }
    }),
    max: 100,
    windowMs: 15 * 60 * 1000 // should match expireTimeMs
});

// Routers
const userRouter = makeUserRouter(csrfProtection, authService, userService, userValidator);



app.use(limiter);
app.use(userRouter);

// TODO: Check if removing expired tokens works
// Delete all expired refresh tokens
const interval = setInterval(() => {
    authService.deleteAllRefreshTokens({ expireDate: {$lt: new Date()} })
}, 60 * 60 * 1000);
authService.deleteAllRefreshTokens( { expireDate: { $lt: new Date() }});

// Clear the interval when the server is stopped
process.on('SIGINT', () => {
    clearInterval(interval);
    console.log('Interval cleared');
});

// Handle errors
app.use((error, req, res, next) => {
    const { code, message, name } = error;
    console.log(error);
    
    if (code === 'EBADCSRFTOKEN') {
        return res.status(StatusCodes.FORBIDDEN).json({ error: new ServerError(StatusCodes.FORBIDDEN, 'CSRF token validation failed', name) });
    }
    
    switch (name) {
        case 'CastError':
            return res.status(StatusCodes.NOT_FOUND).json({ error: new NotFoundError('User not found') });
        case 'ValidationError':
            return res.status(code).json({ error: error });
        case 'AuthenticationError':
            return res.status(code).json({ error: error });
        case 'TokenExpiredError':
            return res.status(code).json({ error: error });
        case 'JsonWebTokenError':
            return res.status(code).json({ error: error });
    }
    
    
    if (typeof code === 'number') {
        return res.status(code).json({ error: new ServerError(code, message, name) });
    } else {
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: new ServerError(StatusCodes.INTERNAL_SERVER_ERROR, message, name) });
    }
});

mongoose.connect(process.env.DB_URL + process.env.DB_QUERY_PARAM)
    .then(() => {
        app.listen(port, () => console.log(`App server listening on port ${port}!`))
    })
    .catch((error) => {
        console.log('There is an error with the Mongoose connection: ' + error);
    });