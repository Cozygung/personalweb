import jwt from "jsonwebtoken";
import { StatusCodes } from "http-status-codes";
import bcrypt from "bcrypt";
import TokenExpiredError from "jsonwebtoken/lib/TokenExpiredError.js";

class AuthService {
    // TODO: Need to be able to delete expired jwt tokens
    #tokenDAO;
    
    constructor(tokenDAO) {
        this.#tokenDAO = tokenDAO;
    }
    
    authenticateToken = async (req, res, next) => {
        if (req.headers.authorization) {
            const [bearerToken, token] = req.headers.authorization.split(" ");
            console.log(bearerToken);
            if (bearerToken === "Bearer") {
                return new Promise((resolve, reject) => {
                    jwt.verify(token, process.env.JWT_ACCESS_TOKEN_SECRET, (err, user) => {
                        if (err) {
                            return reject(err);
                        }
                        req.user = user;
                        resolve();
                    });
                }).then(() => {
                        next();
                }).catch((err) => {
                    if (err instanceof TokenExpiredError) {
                        return res.status(err.status).send({ error: err.message });
                    }
                    
                    return res.status(StatusCodes.FORBIDDEN).send({ error: "User does not have access to this command!" });
                });
            }
            return res.status(StatusCodes.UNAUTHORIZED).send({ error: "Invalid bearer token" });
        }
        return res.sendStatus(StatusCodes.BAD_REQUEST).send({ error: "Authorization header is not present" });
    };

    isStudent = async (req, res, next) => {
        await this.authenticateToken(req, res, () => {
            if (
                req.user.userType === "Student" ||
                req.user.userType === "Teacher" ||
                req.user.userType === "Admin"
            ) {
                next();
            } else {
                return res.sendStatus(StatusCodes.FORBIDDEN);
            }
        });
    };

    isTeacher = async (req, res, next) => {
        await this.authenticateToken(req, res, () => {
            if (
                req.user.userType === "Teacher" ||
                req.user.userType === "Admin"
            ) {
                next();
            } else {
                return res.sendStatus(StatusCodes.FORBIDDEN);
            }
        });
    };

    isAdmin = async (req, res, next) => {
        await this.authenticateToken(req, res, () => {
            if (req.user.userType === "Admin") {
                next();
            } else {
                return res.sendStatus(StatusCodes.FORBIDDEN);
            }
        });
    };
    
    
    createToken = async (user) => {
        const accessToken = await jwt.sign({ 
                username: user.username, 
                userType: user.userType
            },
            process.env.JWT_ACCESS_TOKEN_SECRET,{
                expiresIn: parseInt(process.env.JWT_ACCESS_TIME, 10),
                issuer: process.env.JWT_ISSUER,
            }
        );
        // Check if refresh token already exists for the user
        const existingRefreshToken = await this.#tokenDAO.getRefreshTokenByUsername(user.username);
        if (!existingRefreshToken) {
            const refreshToken = await jwt.sign({
                    username: user.username,
                    userType: user.userType
                },
                process.env.JWT_REFRESH_TOKEN_SECRET,
                {
                    expiresIn: parseInt(process.env.JWT_REFRESH_TIME, 10),
                    issuer: process.env.JWT_ISSUER,
                }
            );

            const decoded = await jwt.decode(refreshToken);
            const exp = new Date(decoded.exp * 1000)

            const token = {
                refreshToken: refreshToken,
                username: user.username,
                expireDate: exp
            }
            await this.#tokenDAO.activateRefreshToken(token)

            return { accessToken, refreshToken }
        }
        
        return { accessToken, existingRefreshToken }
    }

    refreshAccessToken = async (req, res, next) => {
        console.log("refreshing")
        const refreshToken = req.signedCookies.refreshToken;
        if (!refreshToken) return res.sendStatus(StatusCodes.UNAUTHORIZED);
        if (!this.#tokenDAO.isValidRefreshToken) return res.sendStatus(StatusCodes.FORBIDDEN);
        return new Promise((resolve, reject) => {
            jwt.verify(refreshToken, process.env.JWT_REFRESH_TOKEN_SECRET, {
                expiresIn: parseInt(process.env.JWT_REFRESH_TIME, 10),
                issuer: process.env.JWT_ISSUER,
            }, (err, user) => {
                if (err) {
                    return reject(err);
                }
                resolve(user);
            });
        }).then((user) => {
            // We don't want to rotate refresh tokens otherwise other concurrent devices will be signed out
            const accessToken = jwt.sign({
                    username: user.username,
                    userType: user.userType
                },
                process.env.JWT_ACCESS_TOKEN_SECRET,
                { expiresIn: parseInt(process.env.JWT_ACCESS_TIME, 10) }
            );
            return res.status(StatusCodes.OK).json({ accessToken: accessToken })
        }).catch((err) => {
            return res.status(StatusCodes.FORBIDDEN).send({ error: "User does not have access to this command!" });
        });
    }
    
    revokeRefreshToken = async (refreshToken)  => {
        return await this.#tokenDAO.revokeRefreshToken({ refreshToken: refreshToken })
    }
    
    removeExpiredTokens = async () => {
        const now = new Date();
        await this.#tokenDAO.revokeAllRefreshTokens({ expireDate: { $lt: now }});
    }
}

export default AuthService;