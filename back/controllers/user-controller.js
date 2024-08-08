import {StatusCodes} from "http-status-codes";
import {ForbiddenError} from "../errors/forbidden-error.js";
import {NotFoundError} from "../errors/not-found-error.js";
import {validationResult} from "express-validator";
import {ValidationError} from "../errors/validation-error.js";
import bcrypt from "bcrypt";
import {AuthenticationError} from "../errors/authentication-error.js";
import {ObjectId} from "mongodb";

import UserService from "../middleware/user-service.js";

class UserController {
    #userService;
    #authService;

    constructor(mongoose, userService, authService) {
        this.#userService = userService;
        this.#authService = authService;
        this.mongoose = mongoose;
    }
    
    getUserList = async (req, res, next) => {
        try {
            const {filter, limit, page, sortBy} = req.body;
            const users = await this.#userService.getUserList(filter, limit, page, sortBy);

            return res.status(StatusCodes.OK).json({ users: users });
        } catch (error) {
            return next(error);
        }
    }
    
    getUser = async (req, res, next) => {
        try {
            const authenticatedUser = req.user;
            // If a student is trying to access other users' information
            if (authenticatedUser.userType === 'Student' && authenticatedUser._id !== req.params.userId) {
                return next( new ForbiddenError('User does not have permission') );
            }

            const user = await this.#userService.getUserById(req.params.userId);

            if (!user) {
                return next( new NotFoundError(`User ${req.params.userId} not found`) );
            }

            return res.status(StatusCodes.OK).json({ user: user });
        } catch (error) {
            return next(error);
        }
    }
    
    updateUser = async (req, res, next) => {
        try {
            const errors = validationResult(req);

            if (!errors.isEmpty()) {
                return res.status(StatusCodes.BAD_REQUEST).json({ errors: errors.array() });
            }

            const authenticatedUser = req.user;
            // Only the Admin can modify accounts. Other users can only modify their own account.
            if (authenticatedUser.userType !== 'Admin' && authenticatedUser._id !== req.params.userId) {
                return next( new ForbiddenError('User does not have permission') );
            }

            const updatedUser = await this.#userService.updateUser(req.params.userId, req.body);
            console.log(updatedUser);

            return res.status(StatusCodes.OK).json({ user: updatedUser });
        } catch (error) {
            return next(error);
        }
    }
    
    deleteUser = async (req, res, next) => {
        try {
            const authenticatedUser = req.user;
            // Only the Admin or the user who owns the account can delete their account
            if (authenticatedUser.userType !== 'Admin' && authenticatedUser._id !== req.params.userId) {
                return next( new ForbiddenError('User does not have permission') );
            }

            // This should return a document if it succeeded
            const deletedUser = this.#userService.deleteUserById(req.params.userId);
            console.log(deletedUser);

            return res.sendStatus(StatusCodes.OK);
        } catch (error) {
            return next(error);
        }
    }
    
    createUser = async (req, res, next) => {
        try {
            const errors = validationResult(req);
            console.log(errors)
            if (!errors.isEmpty()) {
                return next( new ValidationError('User validation failed', errors.array()) );
            }

            console.log('Creating user')
            const newUser = await this.#userService.createUser(req.body);

            return res.status(StatusCodes.CREATED).json({ user: newUser });
        } catch (error){
            return next(error);
        }
    }
    
    login = async (req, res, next) => {
        const session = await this.mongoose.startSession();
        session.startTransaction();
        
        try {
            const userDevice = req.body.device;
            userDevice._id = new ObjectId(userDevice._id);
            
            const existingUser = await this.#userService.getUser({ username: req.body.username });
            if (!existingUser || !await bcrypt.compare(req.body.password, existingUser.password)) {
                throw new AuthenticationError('Invalid credentials', 0);
            }
            
            const {accessToken, accessTokenFingerprint} 
                = await this.#authService.createAccessToken(existingUser);
            const {refreshToken, refreshTokenFingerprint, refreshTokenExpireDate, deviceId} 
                = await this.#authService.createRefreshToken(existingUser, userDevice);

            // TODO: replace ipAddress with req.ip
            const ipAddress = '103.241.36.64'
            const ipInfo = await this.#authService.getIPInfo(ipAddress);
            
            const loginInstance = {
                ipAddress: ipAddress,
                action: 'LOGIN',
                deviceId: deviceId,
                location: {
                    city: ipInfo.city,
                    country: ipInfo.country,
                    latitude: ipInfo.lat,
                    longitude: ipInfo.lon
                },
            };
            await this.#authService.addLoginInstance(existingUser._id, loginInstance)
            
            const cookieOptions = {
                httpOnly: true,
                secure: true,
                signed: true,
                sameSite: 'strict',
                maxAge: refreshTokenExpireDate.getTime() - Date.now()
            };
            res.cookie('refreshToken', refreshToken, cookieOptions);
            res.cookie('refreshTokenFingerprint', refreshTokenFingerprint, cookieOptions);
            res.cookie('accessTokenFingerprint', accessTokenFingerprint,
                {...cookieOptions, maxAge: parseInt(process.env.JWT_ACCESS_TOKEN_EXPIRE_TIME, 10) * 1000});

            await session.commitTransaction();
            return res.status(StatusCodes.OK).json({ accessToken: accessToken, deviceId: deviceId.toString() });
        } catch (error) {
            await session.abortTransaction();
            return next(error);
        } finally {
            await session.endSession();
        }
    }
    
    refreshToken = async (req, res, next) => {
        try {
            const encryptedRefreshToken = req.signedCookies.refreshToken;
            const fingerprint = req.signedCookies.refreshTokenFingerprint;
            const userDevice = req.body.device;
            userDevice._id = new ObjectId(userDevice._id);

            const {accessToken, accessTokenFingerprint, deviceId, userId} = 
                await this.#authService.refreshAccessToken(encryptedRefreshToken, fingerprint, userDevice);

            // TODO: replace ipAddress with req.ip
            const ipAddress = '103.241.36.64'
            const ipInfo = await this.#authService.getIPInfo(ipAddress);
            console.log(ipInfo)

            const loginInstance = {
                ipAddress: ipAddress,
                action: 'REFRESH',
                deviceId: deviceId,
                location: {
                    city: ipInfo.city,
                    country: ipInfo.country,
                    latitude: ipInfo.lat,
                    longitude: ipInfo.lon
                },
            };
            await this.#authService.addLoginInstance(userId, loginInstance)
            
            res.cookie('accessTokenFingerprint', accessTokenFingerprint, {
                httpOnly: true,
                secure: true,
                signed: true,
                sameSite: 'strict',
                maxAge: parseInt(process.env.JWT_ACCESS_TOKEN_EXPIRE_TIME, 10) * 1000
            });
            
            return res.status(StatusCodes.OK).json({ accessToken: accessToken, deviceId: deviceId});
        } catch(error) {
            return next(error);
        }
    }
    
    logout = async (req, res, next) => {
        const session = await this.mongoose.startSession();
        session.startTransaction();
        
        try {
            const userId = new ObjectId(req.user._id);
            const userDevice = req.body.device;
            const deviceId = new ObjectId(userDevice._id)
            
            // Remove the device
            const updatedToken = await this.#authService.removeDevice(userId, deviceId,
                { returnDocument: 'after', session } // Use the session for transaction
            );

            // Check if devices list is empty
            if (updatedToken && updatedToken.devices.length === 0) {
                await this.#authService.deleteRefreshToken({ userId: userId }, { session })
            }

            res.clearCookie('_csrf');
            res.clearCookie('refreshToken');
            res.clearCookie('refreshTokenFingerprint');
            res.clearCookie('accessTokenFingerprint');

            await session.commitTransaction();
            return res.sendStatus(StatusCodes.OK);
        } catch (error) {
            await session.abortTransaction();
            return next(error);
        } finally {
            await session.endSession();
        }
    }
    
    logoutAllDevices = async (req, res, next) => {
        try {
            await this.#authService.deleteRefreshTokenByUserId(req.user._id);

            res.clearCookie('_csrf');
            res.clearCookie('refreshToken');
            res.clearCookie('refreshTokenFingerprint');
            res.clearCookie('accessTokenFingerprint');

            return res.sendStatus(StatusCodes.OK);
        } catch (error) {
            return next(error);
        }
    }
    
    deleteAllTokens = async (req, res, next) => {
        try {
            const { revocationDate } = req.query;
            await this.#authService.deleteAllRefreshTokensCreatedBeforeDate(revocationDate)

        } catch (error) {
            return next(error);
        }
    }
    
    test = async (req, res, next) => {
        // TODO: .render()
        return res.status(StatusCodes.MOVED_TEMPORARILY).json({ redirect: '/login' });
    }
    
    redirected = async (req, res, next) => {
        console.log("TEST")
        console.log(res)
        return res.status(StatusCodes.OK).send("Redirected");
    }
}

export default UserController;