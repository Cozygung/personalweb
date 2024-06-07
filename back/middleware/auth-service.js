import jwt from "jsonwebtoken";
import { StatusCodes } from "http-status-codes";
import bcrypt from "bcrypt";

class AuthService {
    // TODO: Need to be able to delete expired jwt tokens
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
    
    
    createToken = (user) => {
        const accessToken = jwt.sign({ 
                _id: user._id,
                username: user.username, 
                userType: user.userType
            
            },
            process.env.JWT_ACCESS_TOKEN_SECRET,{
                expiresIn: parseInt(process.env.JWT_ACCESS_TIME, 10),
                issuer: process.env.JWT_ISSUER,
            }
        );
        const refreshToken = jwt.sign({
                _id: user._id,
                username: user.username,
                userType: user.userType
            },
            process.env.JWT_REFRESH_TOKEN_SECRET,
            {
                expiresIn: parseInt(process.env.JWT_REFRESH_TIME, 10),
                issuer: process.env.JWT_ISSUER,
            }
        );
        return { accessToken, refreshToken }
    }

    refreshToken = async (req, res, next) => {
        const refreshToken = req.signedCookies.refreshToken;
        if (!refreshToken) return res.sendStatus(StatusCodes.UNAUTHORIZED);
        if (!refreshToken.includes(refreshToken)) return res.sendStatus(StatusCodes.FORBIDDEN);
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
            const accessToken = jwt.sign({
                    _id: user._id,
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
}

export default AuthService;