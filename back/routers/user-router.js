import express from "express";
import {ReasonPhrases, StatusCodes} from "http-status-codes";
import bcrypt from "bcrypt";

// TODO: Check if you need return statements or if you can just res.send()
// TODO: Convert all .send() to .json()
// TODO: Change error: to message:  for error messages
// TODO: Add docs for each function
const makeRouter = (csrfProtection, authService, userService, userValidator) => {
    const userRouter = express.Router();

    /** @returns
     *
     * */
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

    // TODO: Look at UpdateUserValidatorChain
    userRouter.post("/user", authService.isAdmin, userValidator.updateUserValidatorChain, async (req, res, next) => {
        try {
            console.log("Creating user")
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
            const existingUser = await userService.getUser({ username: req.body.username });

            if (await bcrypt.compare(req.body.password, existingUser.password)) {
                const cookieOptions = {
                    httpOnly: true,
                    secure: true,
                    signed: true,
                    sameSite: 'strict',
                    maxAge: parseInt(process.env.JWT_REFRESH_TOKEN_EXPIRE_TIME, 10) * 1000
                };
                const {token: accessToken, fingerprint: accessTokenFingerprint} = await authService.createToken(existingUser);
                const {token: refreshToken, fingerprint: refreshTokenFingerprint} = await authService.createToken(existingUser, true);
                res.cookie('refreshToken', refreshToken, cookieOptions);
                res.cookie('refreshTokenFingerprint', refreshTokenFingerprint, cookieOptions);
                res.cookie('accessTokenFingerprint', accessTokenFingerprint, 
                    {...cookieOptions, maxAge: parseInt(process.env.JWT_ACCESS_TOKEN_EXPIRE_TIME, 10) * 1000});
                return res.status(StatusCodes.OK).json({ accessToken: accessToken });
            } else {
                return res.sendStatus(StatusCodes.UNAUTHORIZED);
            }

        } catch (error) {
            return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
        }
    });
    
    userRouter.get("/form", csrfProtection, authService.isStudent, async (req, res, next) => {
        res.send({ csrfToken: req.csrfToken() });
    })
    
    userRouter.post("/token", csrfProtection, async (req, res, next) => {
        try {
            const encryptedRefreshToken = req.signedCookies.refreshToken;
            const fingerprint = req.signedCookies.refreshTokenFingerprint;

            const {token: accessToken, fingerprint: accessTokenFingerprint} = await authService.refreshAccessToken(encryptedRefreshToken, fingerprint);

            res.cookie('accessTokenFingerprint', accessTokenFingerprint, {
                httpOnly: true,
                secure: true,
                signed: true,
                sameSite: 'strict',
                maxAge: parseInt(process.env.JWT_ACCESS_TOKEN_EXPIRE_TIME, 10) * 1000
            });
            return res.status(StatusCodes.OK).json({ accessToken: accessToken });
        } catch(error) {
            if (error.name === 'TokenExpiredError') {
                return res.status(StatusCodes.UNAUTHORIZED).send({ error: 'RefreshTokenExpiredError', message: error.message });
            }

            return res.status(error.code).send({ error: error.name, message: error.message });
        }
    }); 
    
    userRouter.post("/logout", async (req, res, next) => {
        // TODO: Remove cookies from client even when server goes offline
        try {
            const revokedToken = await authService.deleteRefreshToken(req.signedCookies.refreshToken);
            res.clearCookie("_csrf");
            res.clearCookie("refreshToken");
            res.clearCookie("refreshTokenFingerprint");
            res.clearCookie("accessTokenFingerprint");

            return res.status(StatusCodes.OK).send({ revokedToken: revokedToken });
        } catch (error) {
            return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: error.message });
        }
    })
    
    return userRouter;
}

export default makeRouter;