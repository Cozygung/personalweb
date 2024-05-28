import express from "express";
import jwt from "jsonwebtoken";
import {ReasonPhrases, StatusCodes} from "http-status-codes";

// TODO: Check if you need return statements or if you can just res.send()
const makeRouter = (authService, userService) => {
    const userRouter = express.Router();

    userRouter.get("/user", authService.isTeacher, userService.getUserList, async (req, res) => {
        try {
            const users = req.userList;

            return res.status(StatusCodes.OK).send(users);
        } catch (error) {
            return res.status(StatusCodes.BAD_REQUEST).send({ error: error.message });
        }
    });

    userRouter.get("/user/:userId", authService.isTeacher, userService.getUserById, async (req, res) => {
        try {
            const user = req.user;

            return res.status(StatusCodes.OK).send(user);
        } catch (error) {
            return res.status(StatusCodes.BAD_REQUEST).send({ error: error.message });
        }
    });

    userRouter.patch("/user/:userId", authService.isAdmin, userService.updateUser, async (req, res) => {
        try {
            const user = req.user;

            return res.status(StatusCodes.OK).send(user);
        } catch (error) {
            return res.status(StatusCodes.BAD_REQUEST).send({ error: error.message });
        }
    });

    userRouter.delete("/user/:userId", authService.isTeacher, userService.getUserById, userService.deleteUserById, async (req, res) => {
        try {
            
            
            return res.sendStatus(StatusCodes.OK);
        } catch (error) {
            return res.status(StatusCodes.BAD_REQUEST).send({ error: error.message });
        }
    });

    userRouter.post("/user", authService.isAdmin, userService.checkUniqueUsername, userService.validator, async (req, res) => {
        try {
            const newUser = await userService.createUser(req.body);

            return res.status(StatusCodes.CREATED).send(newUser);
        } catch (error){
            console.log(error);
            res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: error });
        }
    });

    userRouter.post("/login", async (req, res) => {
        // TODO: There must be another better way to login
        const { username, password } = req.body;
        const user = await userService.getUserById({ username: username.toString() });

        if (user && password === user.password) {
            console.log(user.toObject());
            const accessToken = jwt.sign(
                user.toObject(),
                process.env.ACCESS_TOKEN_SECRET,
                { expiresIn: "10h" }
            );
            return res
                .status(StatusCodes.OK)
                .json({ message: "Login successful", token: accessToken, user: user });
        } else {
            return res.status(StatusCodes.UNAUTHORIZED).json({ message: "Login failed" });
        }
    });
    
    return userRouter;
}

export default makeRouter;