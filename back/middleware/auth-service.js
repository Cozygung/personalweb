import jwt from "jsonwebtoken";
import crypto from "crypto";
import {ReasonPhrases, StatusCodes} from "http-status-codes";
import TokenExpiredError from "jsonwebtoken/lib/TokenExpiredError.js";
import {ServerError} from "../errors/server-error.js";

class AuthService {
    // TODO: Need to implement blacklisting tokens created before certain date
    #tokenDAO;
    
    constructor(tokenDAO) {
        this.#tokenDAO = tokenDAO;
    }
    
    authenticateToken = async (req, res, next) => {
        if (req.headers.authorization) {
            const [bearerToken, encryptedToken] = req.headers.authorization.split(" ");
            if (bearerToken === "Bearer") {
                const accessToken = this.decryptToken(encryptedToken);
                const fingerprint = req.signedCookies.accessTokenFingerprint;
                const SECRET_KEY = process.env.JWT_ACCESS_TOKEN_SECRET;
                const EXPIRE_TIME = parseInt(process.env.JWT_ACCESS_TOKEN_EXPIRE_TIME, 10);
                
                // Verify the token and throw TokenExpiredError if expired || This is easier to read than Try / Catch
                return await this.jwtVerifyToken(accessToken, fingerprint, SECRET_KEY, EXPIRE_TIME).then((decoded) => {
                    // TODO: Might need to fetch the entire user object from DB
                    const {username, userType} = decoded;
                    req.user = {username, userType};
                    
                    return next();
                }).catch((err) => {
                    if (err.name === 'TokenExpiredError') {
                        console.log("working")
                        return res.status(StatusCodes.UNAUTHORIZED).send({ error: 'TokenExpiredError', message: err.message });
                    }
                    
                    return res.sendStatus(StatusCodes.FORBIDDEN).send({ error: 'InvalidTokenError', message: "Invalid bearer token" });
                });
            }
            return res.status(StatusCodes.FORBIDDEN).send({ error: 'InvalidTokenError', message: "Invalid bearer token" });
        }
        return res.status(StatusCodes.UNAUTHORIZED).send({ error: 'MissingTokenError', message: "Authorization header is not present" });
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

    // GDPR Data Regulatory requirements
    encryptToken = (token) => {
        const iv = crypto.randomBytes(12); // Initialization vector (12 bytes for GCM)
        const key = Buffer.from(process.env.JWT_TOKEN_CIPHER_SECRET, 'hex');
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

        let encryptedToken = cipher.update(token, 'utf8', 'hex');
        encryptedToken += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');

        return `${iv.toString('hex')}:${encryptedToken}:${authTag}`;
    }

    decryptToken = (encryptedToken) => {
        const [ivHex, encryptedHex, authTagHex] = encryptedToken.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const encryptedData = Buffer.from(encryptedHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');

        const key = Buffer.from(process.env.JWT_TOKEN_CIPHER_SECRET, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);

        let decryptedToken = decipher.update(encryptedData, 'hex', 'utf8');
        decryptedToken += decipher.final('utf8');

        return decryptedToken;
    }
    
    jwtVerifyToken = async(token, fingerprint, secretKey, expireDate) => {
        return new Promise((resolve, reject) => {
            jwt.verify(token, secretKey, {
                algorithms: ['HS256'],
                expiresIn: expireDate,
                issuer: process.env.JWT_ISSUER,
            }, (err, decoded) => {
                if (err) {
                    return reject(err);
                }
                if (typeof fingerprint === undefined || decoded.fingerprint !== fingerprint) {
                    const exp = new Date(decoded.exp * 1000).toISOString();
                    const tokenExpiredError = new TokenExpiredError("jwt expired", exp);
                    tokenExpiredError.name = 'TokenExpiredError'
                    
                    return reject(tokenExpiredError)
                }
                resolve(decoded);
            });
        })
    }

    jwtSignToken = async (user, fingerprint, secretKey, expireDate, issuer) => {
        return await jwt.sign({
                username: user.username,
                userType: user.userType,
                fingerprint: fingerprint,
            },
            secretKey,{
                algorithm: 'HS256',
                expiresIn: parseInt(expireDate, 10),
                issuer: issuer,
            }
        );
    }

    // HS256 algorithm to prevent 'NONE' hashing algorithm attack
    createToken = async (user, createRefreshToken= false) => {
        const SECRET_KEY = createRefreshToken ? process.env.JWT_REFRESH_TOKEN_SECRET : process.env.JWT_ACCESS_TOKEN_SECRET;
        const EXPIRE_TIME = createRefreshToken ? process.env.JWT_REFRESH_TOKEN_EXPIRE_TIME : process.env.JWT_ACCESS_TOKEN_EXPIRE_TIME;
        
        if (createRefreshToken) {
            // Check if refresh token already exists for the user
            const existingEncryptedRefreshToken = await this.#tokenDAO.getRefreshTokenByUsername(user.username);
            if (existingEncryptedRefreshToken) {
                const token = this.decryptToken(existingEncryptedRefreshToken.refreshToken);
                const decoded = await jwt.decode(token, SECRET_KEY);
                const expiryDate = new Date(decoded.exp * 1000);
                const currentDate = new Date();
                
                // If token is expired remove it from the DB and create a new token
                if (expiryDate < currentDate) {
                    await this.#tokenDAO.deleteRefreshToken(existingEncryptedRefreshToken)
                } else {
                    return { token: existingEncryptedRefreshToken.refreshToken, fingerprint: decoded.fingerprint }
                }
            }
        }
        const userFingerprint = crypto.randomBytes(50).toString('hex');
        const token = await this.jwtSignToken(user, userFingerprint, SECRET_KEY, parseInt(EXPIRE_TIME, 10), process.env.JWT_ISSUER);
        const encryptedToken = this.encryptToken(token);
        
        if (createRefreshToken) {
            const decoded = await jwt.decode(token, SECRET_KEY);
            const expireDate = new Date(decoded.exp * 1000)

            const refreshTokenObject = {
                refreshToken: encryptedToken,
                username: user.username,
                expireDate: expireDate
            }
            await this.#tokenDAO.addRefreshToken(refreshTokenObject)
        }
        
        return {token: encryptedToken, fingerprint: userFingerprint}
    }

    refreshAccessToken = async (encryptedRefreshToken, fingerprint) => {
        console.log("refreshing")
        const refreshToken = this.decryptToken(encryptedRefreshToken);
        const SECRET_KEY = process.env.JWT_REFRESH_TOKEN_SECRET;
        const EXPIRE_TIME = parseInt(process.env.JWT_REFRESH_TOKEN_EXPIRE_TIME, 10);
        
        // Check if refreshToken exists and is valid
        if (!encryptedRefreshToken) {
            // TODO: Create an Error object for Tokens
            const error = new ServerError(StatusCodes.UNAUTHORIZED, 'Missing Refresh Token') 
            error.name = 'MissingTokenError';
            throw error
        }
        if (!await this.#tokenDAO.isValidRefreshToken(encryptedRefreshToken)) {
            const error = new ServerError(StatusCodes.FORBIDDEN, 'Invalid Refresh Token')
            error.name = 'InvalidTokenError';
            throw error
        }
        
        return await this.jwtVerifyToken(refreshToken, fingerprint, SECRET_KEY, EXPIRE_TIME).then(async (decoded) => {
            // We don't want to rotate refresh tokens otherwise other concurrent devices will be signed out
            const {username, userType} = decoded;
            // TODO: Might need to fetch the entire user object from DB
            const user = {username, userType};

            return await this.createToken(user);
        });
    }
    
    deleteRefreshToken = async (refreshToken)  => {
        return await this.#tokenDAO.deleteRefreshToken({ refreshToken: refreshToken })
    }
    
    deleteAllExpiredRefreshTokens = async () => {
        const now = new Date();
        await this.#tokenDAO.deleteAllRefreshTokens({ expireDate: { $lt: now }});
    }
}

export default AuthService;