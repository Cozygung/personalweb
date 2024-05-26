import express from "express";
import jwt from "jsonwebtoken";
import {ReasonPhrases, StatusCodes} from "http-status-codes";

// TODO: Check if you need return statements or if you can just res.send()
const makeRouter = (authService, userService) => {
    const userRouter = express.Router();

    userRouter.get("/user", authService.isTeacher, async (req, res) => {
        try {
            const users = await userService.getUserList();

            return res.status(StatusCodes.OK).send(users);
        } catch (error) {
            return res.status(StatusCodes.BAD_REQUEST).send({ error: error.message });
        }
    });

    userRouter.get("/user/:userId", authService.isTeacher, async (req, res) => {
        try {
            const userId = req.params.userId
            const user = await userService.getUserById(userId);
            
            if (!user) {
                return res
                    .status(StatusCodes.NOT_FOUND)
                    .send({ error: ReasonPhrases.NOT_FOUND });
            }

            return res.status(StatusCodes.OK).send(user);
        } catch (error) {
            return res.status(StatusCodes.BAD_REQUEST).send({ error: error.message });
        }
    });

    userRouter.patch("/user/:userId", authService.isAdmin, async (req, res) => {
        try {
            const userId = req.params.userId;
            const updates = req.body;
            const user = await userService.updateUser(userId, updates);

            // TODO: Need to catch errors
            console.log(user);

            return res.status(StatusCodes.OK).send(user);
        } catch (error) {
            return res.status(StatusCodes.BAD_REQUEST).send({ error: error.message });
        }
    });

    userRouter.delete("/user/:userId", authService.isTeacher, async (req, res) => {
        const userId = req.params.userId

        try {
            const user = await userService.deleteUserById(userId);

            // TODO: Need to catch errors
            console.log(user);

            // TODO: Move this to middleware
            if (req.user.userType !== "Admin" && req.user._id !== userId) {
                return res
                    .status(StatusCodes.FORBIDDEN)
                    .send( { error: ReasonPhrases.FORBIDDEN });
            }

            // TODO: Test deleting course in user-service, then remove this line
            // await Course.deleteMany({teachers: {$elemMatch: {_id: userId}}});

            return res.sendStatus(StatusCodes.OK);
        } catch (error) {
            return res.status(StatusCodes.BAD_REQUEST).send({ error: error.message });
        }
    });

    userRouter.post("/user", authService.isAdmin, async (req, res) => {
        try{
            // TODO: Move this to service
            const { username, password } = req.body;

            if (!await this.checkUniqueUsername(username)){
                return res.status(StatusCodes.CONFLICT).send({error: "Username not unique"});
            }

            if (password.length < 8){
                return res.status(StatusCodes.NOT_ACCEPTABLE).send({error: "Password format not acceptable."});
            }
            
            const newUser = await userService.createUser(req.body);

            if (!newUser) {
                return res.status(StatusCodes.UNPROCESSABLE_ENTITY).send({error: "Incorrect format in request payload."});
            }

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