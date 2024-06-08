import express from "express";
import {ReasonPhrases, StatusCodes} from "http-status-codes";
import bcrypt from "bcrypt";

// TODO: Check if you need return statements or if you can just res.send()
const makeRouter = (csrfProtection, authService, userService, userValidator) => {
    const userRouter = express.Router();

    userRouter.get("/users", authService.isTeacher, async (req, res) => {
        try {
            const users = await userService.getUserList(req.body);

            return res.status(StatusCodes.OK).send(users);
        } catch (error) {
            return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: error.message });
        }
    });

    userRouter.get("/user/:userId", authService.isTeacher, async (req, res) => {
        try {
            const user = await userService.getUserById(req.params.userId);

            return res.status(StatusCodes.OK).send(user);
        } catch (error) {
            return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: error.message });
        }
    });

    userRouter.patch("/user/:userId", authService.isAdmin, async (req, res) => {
        try {
            const user = userService.updateUser(req.params.userId, req.body);

            return res.status(StatusCodes.OK).send(user);
        } catch (error) {
            return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: error.message });
        }
    });

    userRouter.delete("/user/:userId", authService.isTeacher, async (req, res) => {
        try {
            // This should return a document if it succeeded
            const doc = userService.deleteUserById(req.params.userId);
            if (!doc.j) {
                return res.sendStatus(StatusCodes.NOT_FOUND);
            }
            return res.sendStatus(StatusCodes.OK);
        } catch (error) {
            return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: error.message });
        }
    });

    userRouter.post("/user", authService.isAdmin, userValidator.updateUserValidatorChain, async (req, res, next) => {
        try {
            const newUser = await userService.createUser(req.body);

            return res.status(StatusCodes.CREATED).send(newUser);
        } catch (error){
            console.log(error)
            return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: error.message });
        }
    });

    // TODO: Need to implement Rate Limiter for Login
    userRouter.post("/login", async (req, res) => {
        try {
            console.log("test");
            const existingUser = await userService.getUser({ username: req.body.username });

            if (await bcrypt.compare(req.body.password, existingUser.password)) {
                // TODO: createToken should replace Refresh Token if it already exists.
                const {accessToken, refreshToken} = await authService.createToken(existingUser);
                return res
                    .cookie('refreshToken', refreshToken, {
                        httpOnly: true,
                        secure: true,
                        signed: true,
                        sameSite: 'strict',
                    })
                    .status(StatusCodes.OK)
                    .json({ accessToken: accessToken });
            } else {
                return res.sendStatus(StatusCodes.UNAUTHORIZED);
            }

        } catch (error) {
            return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: error.message });
        }
    });
    
    userRouter.get("/form", csrfProtection, authService.isStudent, async (req, res, nex) => {
        res.send({ csrfToken: req.csrfToken() });
    })
    
    userRouter.post("/token", csrfProtection, authService.isStudent, authService.refreshAccessToken); 
    
    userRouter.post("/logout", async (req, res, next) => {
        // TODO: Remove Refresh Token from database
        try {
            const revokedToken = await authService.revokeRefreshToken(req.signedCookies.refreshToken)
            res.clearCookie("_csrf")
            res.clearCookie("refreshToken")

            return res.status(StatusCodes.OK).send({ revokedToken: revokedToken });
        } catch (error) {
            return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: error.message });
        }
    })
    
    return userRouter;
}

export default makeRouter;