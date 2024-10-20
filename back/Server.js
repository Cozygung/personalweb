import * as dotenv from 'dotenv';
import express from 'express';
import { Mongoose } from 'mongoose';
import neo4j from "neo4j-driver";

import {StatusCodes} from 'http-status-codes';
import {ServerError} from './errors/server-error.js';
import {NotFoundError} from './errors/not-found-error.js';

// Security
import cors from 'cors';
import cookieParser from 'cookie-parser';
import csrf from 'csurf';
import { rateLimit } from 'express-rate-limit';
import MongoStore from 'rate-limit-mongo';

// Services
import AuthService from './middleware/auth-service.js';

import makeUserModel from './models/user-model.js';
import UserValidator from './middleware/validator/user-validator.js';
import UserDao from './dao/user-dao.js';
import UserService from './middleware/user-service.js';
import UserController from "./controllers/user-controller.js";

import makeRefreshTokenModel from './models/token-model.js';
import TokenDao from './dao/token-dao.js';

import BusService from "./middleware/bus-service.js";
import BusController from "./controllers/bus-controller.js";

// Routers
import makeUserRouter from './routers/user-router.js';
import makeBusRouter from './routers/bus-router.js';

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

// Security
const authService = new AuthService(refreshTokenDAO);
const csrfProtection = csrf({ cookie: {
        httpOnly: true,
        secure: true,
        signed: true,
        sameSite: 'strict',
    }});

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

// User Middleware
const userModel = makeUserModel(mongoose);
const userDao = new UserDao(userModel);
const userService = new UserService(userDao);
const userController = new UserController(mongoose, userService, authService);
const userValidator = new UserValidator(userService);

// Bus Middleware
const neo4jDriver = neo4j.driver(process.env.NEO4J_URL_LOCALHOST, neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD));
const busService = new BusService();
const busController = new BusController(neo4jDriver, busService);

// Routers
const userRouter = makeUserRouter(csrfProtection, authService, userController, userValidator);
const busRouter = makeBusRouter(csrfProtection, busController);



// TODO: app.use(limiter);
app.use(userRouter);
app.use(busRouter);

// Delete all expired refresh tokens
const interval = setInterval(() => {
    console.log("Deleting expired tokens")
    authService.deleteExpiredTokens()
}, 60 * 60 * 1000);
authService.deleteExpiredTokens();

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
            if (error.type === 2) {
                res.clearCookie('refreshToken');
                res.clearCookie('refreshTokenFingerprint');
                res.clearCookie('accessTokenFingerprint');
            }
            return res.status(code).json({ error: error });
        case 'TokenExpiredError':
            if (error.type === 2) {
                res.clearCookie('refreshToken');
                res.clearCookie('refreshTokenFingerprint');
                res.clearCookie('accessTokenFingerprint');
            }
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