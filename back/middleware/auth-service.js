import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import {TokenExpiredError} from '../errors/token-expired-error.js';
import {ForbiddenError} from '../errors/forbidden-error.js';
import {AuthenticationError} from '../errors/authentication-error.js';
import {JsonWebTokenError} from "../errors/jwt-error.js";

class AuthService {
    #tokenDAO;
    
    constructor(tokenDAO) {
        this.#tokenDAO = tokenDAO;
    }

    /**
     * Checks user authentication found in the authorization header
     * @returns TokenExpiredError (401) if authToken has expired
     * @returns InvalidTokenError (401) if authToken is not formatted correctly
     * @returns MissingTokenError (401) if authToken is missing
     * */
    authenticateToken = async (req, res, next) => {
        if (req.headers.authorization) {
            const [bearerToken, encryptedToken] = req.headers.authorization.split(' ');
            if (bearerToken === 'Bearer') {
                const accessToken = this.decryptToken(encryptedToken);
                const fingerprint = req.signedCookies.accessTokenFingerprint;
                const SECRET_KEY = process.env.JWT_ACCESS_TOKEN_SECRET;
                const EXPIRE_TIME = parseInt(process.env.JWT_ACCESS_TOKEN_EXPIRE_TIME, 10);
                
                // Verify the token and throw TokenExpiredError if expired || This is easier to read than Try / Catch
                return await this.jwtVerifyToken(accessToken, fingerprint, SECRET_KEY, EXPIRE_TIME, 1).then((decoded) => {
                    const {_id, userType} = decoded;
                    req.user = {_id, userType};
                    
                    return next();
                }).catch((error) => {
                    return next(error);
                });
            }
            return next( new AuthenticationError('Invalid Auth Token', 1) );
        }
        console.log("TEST");
        console.log(req.headers.signedCookies);
        return next( new AuthenticationError('Missing Auth Header', 1) );
    };

    isStudent = async (req, res, next) => {
        await this.authenticateToken(req, res, (error) => {
            if (error) {
                return next(error);
            }
            
            if (
                req.user.userType === 'Student' ||
                req.user.userType === 'Teacher' ||
                req.user.userType === 'Admin'
            ) {
                return next();
            } else {
                return next( new ForbiddenError('User does not have permission') );
            }
        });
    };

    isTeacher = async (req, res, next) => {
        await this.authenticateToken(req, res, (error) => {
            if (error) {
                return next(error);
            }
            
            if (
                req.user.userType === 'Teacher' ||
                req.user.userType === 'Admin'
            ) {
                return next();
            } else {
                return next( new ForbiddenError('User does not have permission') );
            }
        });
    };

    isAdmin = async (req, res, next) => {
        await this.authenticateToken(req, res, (error) => {
            if (error) {
                return next(error);
            }
            
            if (req.user.userType === 'Admin') {
                return next();
            } else {
                return next( new ForbiddenError('User does not have permission') );
            }
        });
    };

    // GDPR Data Regulatory requirements
    /**
     * Encrypts the token using the AES-256 algorithm in GCM mode (Following GDPR Data Regulatory requirements)
     * @param {Object} token - accessToken or refreshToken
     * @returns {String} encryptedToken - in the form IV:encryptedToken:authTag
     * */
    encryptToken = (token) => {
        const iv = crypto.randomBytes(12); // Initialization vector (12 bytes for GCM)
        const key = Buffer.from(process.env.JWT_TOKEN_CIPHER_SECRET, 'hex');
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

        let encryptedToken = cipher.update(token, 'utf8', 'hex');
        encryptedToken += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');

        return `${iv.toString('hex')}:${encryptedToken}:${authTag}`;
    }

    /**
     * Decrypts the token using the same encryption algorithm: AES-256-GCM 
     * @param {Object} encryptedToken - accessToken or refreshToken
     * @returns {Object} decryptedToken - JWT token
     * */
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

    /**
     * Verify the token 
     * @param {Object} token - accessToken or refreshToken
     * @param {String} fingerprint - Unique fingerprint that marks the identity of the token
     * @param {String} secretKey - Secret key used to create the token
     * @param {Number} expireDate - Expiration time relative to when the token was created (in seconds)
     * @param {Number} tokenType - REFRESH_TOKEN = 2 or ACCESS_TOKEN = 1
     * @returns {Object} decodedToken - decoded accessToken or refreshToken
     * */
    jwtVerifyToken = async(token, fingerprint, secretKey, expireDate, tokenType) => {
        return new Promise((resolve, reject) => {
            jwt.verify(token, secretKey, {
                algorithms: ['HS256'],
                expiresIn: expireDate,
                issuer: process.env.JWT_ISSUER,
            }, (err, decoded) => {
                if (err) {
                    switch (err.name) {
                        case 'TokenExpiredError':
                            return reject(new TokenExpiredError('JWT token has expired', tokenType));
                        case 'JsonWebTokenError':
                            return reject(new JsonWebTokenError('JWT token has expired', tokenType));
                        default:
                            return reject(err);
                    }
                }
                if (typeof fingerprint === undefined || decoded.fingerprint !== fingerprint) {
                    return reject( new AuthenticationError('JWT Token verification failed', tokenType) );
                }
                resolve(decoded);
            });
        })
    }

    /**
     * Wrapper function for signing new JWT tokens. This should only be used inside of auth-service.js
     * */
    jwtSignToken = async (user, fingerprint, secretKey, expireDate, issuer) => {
        return await jwt.sign({
                _id: user._id.toString(),
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
    
    /**
     * Creates a new JWT token. Enforces the HS256 algorithm to prevent 'NONE' hashing algorithm attack
     * @param {Object} user - Object containing the _id and userType of a user
     * @param {Boolean} createRefreshToken - True if you want to create a refreshToken, otherwise defaults to false
     * @returns {Object} EncryptedToken and the fingerprint that marks its identity
     * */
    createToken = async (user, createRefreshToken= false) => {
        const SECRET_KEY = createRefreshToken ? process.env.JWT_REFRESH_TOKEN_SECRET : process.env.JWT_ACCESS_TOKEN_SECRET;
        const EXPIRE_TIME = createRefreshToken ? process.env.JWT_REFRESH_TOKEN_EXPIRE_TIME : process.env.JWT_ACCESS_TOKEN_EXPIRE_TIME;
        
        if (createRefreshToken) {
            // Check if refresh token already exists for the user
            const existingEncryptedRefreshToken = await this.#tokenDAO.getRefreshTokenByUserId(user._id.toString());
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
        const userFingerprint = crypto.randomBytes(16).toString('hex');
        const token = await this.jwtSignToken(user, userFingerprint, SECRET_KEY, parseInt(EXPIRE_TIME, 10), process.env.JWT_ISSUER);
        const encryptedToken = this.encryptToken(token);
        
        if (createRefreshToken) {
            const decoded = await jwt.decode(token, SECRET_KEY);
            const expireDate = new Date(decoded.exp * 1000)

            const refreshTokenObject = {
                refreshToken: encryptedToken,
                userId: user._id.toString(),
                expireDate: expireDate
            }
            await this.#tokenDAO.addRefreshToken(refreshTokenObject)
        }
        
        return {token: encryptedToken, fingerprint: userFingerprint}
    }

    /**
     * Creates a new JWT token. Enforces the HS256 algorithm to prevent 'NONE' hashing algorithm attack
     * @param {Object} encryptedRefreshToken - Encrypted JWT refreshToken
     * @param {String} fingerprint - Unique fingerprint that marks the identity of the token
     * @returns {Object} accessToken - JSON object containing the encryptedToken and the fingerprint that marks its identity
     * @returns InvalidTokenError (401) if refreshToken is missing or invalid (IE. Not stored in the DB whitelist)
     * @returns TokenExpiredError (401) if refreshToken is expired
     * */
    refreshAccessToken = async (encryptedRefreshToken, fingerprint) => {
        console.log('refreshing')
        const refreshToken = this.decryptToken(encryptedRefreshToken);
        const SECRET_KEY = process.env.JWT_REFRESH_TOKEN_SECRET;
        const EXPIRE_TIME = parseInt(process.env.JWT_REFRESH_TOKEN_EXPIRE_TIME, 10);
        
        // Check if refreshToken exists and is valid
        if (!encryptedRefreshToken) {
            throw new AuthenticationError('Missing Refresh Token', 2)
        }
        if (!await this.#tokenDAO.isValidRefreshToken(encryptedRefreshToken)) {
            throw new AuthenticationError( 'Invalid Refresh Token', 2)
        }
        
        return await this.jwtVerifyToken(refreshToken, fingerprint, SECRET_KEY, EXPIRE_TIME, 2).then(async (decoded) => {
            // We don't want to rotate refresh tokens otherwise other concurrent devices will be signed out
            const {_id, userType} = decoded;
            const user = {_id, userType};

            return await this.createToken(user);
        });
    }
    
    deleteRefreshToken = async (refreshToken)  => {
        return await this.#tokenDAO.deleteRefreshToken({ refreshToken: refreshToken })
    }
    
    deleteAllRefreshTokens = async (query) => {
        const now = new Date();
        await this.#tokenDAO.deleteAllRefreshTokens(query);
    }
}

export default AuthService;