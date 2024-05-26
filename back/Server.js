import * as dotenv from "dotenv"
import express from "express"
import cors from "cors"

import AuthService from "./middleware/auth-service.js";

import makeUserModel from "./models/user-model.js";
import UserDao from "./dao/user-dao.js";
import UserService from "./middleware/user-service.js";

import makeUserRouter from "./routers/user-router.js"
import mongoose from "mongoose";

// Load Environment Variables from .env.production
dotenv.config({path: `config/.env.${process.env.NODE_ENV}`});

// Express handles HTTP Requests and responses
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors({
    origin: process.env.CLIENT_URL
}));
app.use(
    express.urlencoded({
        extended: true,
    })
);

const authService = new AuthService();

// User Router Dependency Injection
const userModel = makeUserModel(mongoose);
const userDao = new UserDao(userModel);
const userService = new UserService(userDao);
const userRouter = makeUserRouter(authService, userService);

app.use(userRouter);

app.use((error, req, res, next) => {
    const status = error.status || 500;
    const message = error.message || "Something went wrong.";
    res.status(status).json({ message: message });

    // this means that the front end when error handling can also access the message property
    // eg catch(error => console.log(error.message))
});

mongoose.connect(process.env.DB_URL)
    .then(() => {
        app.listen(port, () => console.log(`App server listening on port ${port}!`))
    })
    .catch((error) => {
        console.log("There is an error with the Mongoose connection: " + error);
    });