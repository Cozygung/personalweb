import express from 'express';
import {StatusCodes} from 'http-status-codes';
import bcrypt from 'bcrypt';
import {validationResult} from 'express-validator';
import {AuthenticationError} from '../errors/authentication-error.js';
import {ValidationError} from '../errors/validation-error.js';
import {ForbiddenError} from '../errors/forbidden-error.js';
import {NotFoundError} from "../errors/not-found-error.js";

// TODO: Add return before all next()
const makeRouter = (csrfProtection, authService, userService, userValidator) => {
    const userRouter = express.Router();

    /** 
     * GET - Get User list
     * Get a list of users following the characteristics defined in 'query'
     * Permissions: Teachers and Admins have access
     * @param {User.<string, any>} payload - Search query containing User fields
     * @returns {User[]} - List of Users
     * */
    userRouter.get('/users', authService.isTeacher, async (req, res, next) => {
        try {
            const users = await userService.getUserList(req.body);

            return res.status(StatusCodes.OK).json({ users: users });
        } catch (error) {
            next(error);
        }
    });

    /**
     * GET - Get User
     * Get a user with userId = 'userId'
     * Permissions: Students can access their own information. Teachers and Admins have access too all students.
     * @param {String} userId - User ID
     * @returns {User} - A User object
     * */
    userRouter.get('/users/:userId', authService.isStudent, async (req, res, next) => {
        try {
            const authenticatedUser = req.user;
            // If a student is trying to access other users' information
            if (authenticatedUser.userType === 'Student' && authenticatedUser._id !== req.params.userId) {
                return next( new ForbiddenError('User does not have permission') );
            }
            
            const user = await userService.getUserById(req.params.userId);

            if (!user) {
                return next( new NotFoundError(`User ${req.params.userId} not found`) );
            }

            return res.status(StatusCodes.OK).json({ user: user });
        } catch (error) {
            next(error);
        }
    });

    /**
     * PATCH - Update existing User
     * Update a user with userId = 'userId' using the updates defined in 'updates'
     * Permissions: Students and Teachers can update their own profile. Admins can update all profiles.
     * @param {String} userId - User ID
     * @param {User.<string, any>} payload - A set of fields and their new values
     * @returns {User} - Updated User object
     * */
    userRouter.patch('/users/:userId', authService.isStudent, csrfProtection, userValidator.updateUserValidatorChain, async (req, res, next) => {
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
            
            const updatedUser = await userService.updateUser(req.params.userId, req.body);
            console.log(updatedUser);

            return res.status(StatusCodes.OK).json({ user: updatedUser });
        } catch (error) {
            next(error);
        }
    });

    /**
     * DELETE - Delete existing User
     * Delete a user with userId = 'userId'
     * Permissions: Students and Teachers can delete their own profile. Admins can delete all profiles.
     * @param {String} userId - User ID
     * */
    userRouter.delete('/users/:userId', authService.isStudent, csrfProtection, async (req, res, next) => {
        try {
            const authenticatedUser = req.user;
            // Only the Admin or the user who owns the account can delete their account
            if (authenticatedUser.userType !== 'Admin' && authenticatedUser._id !== req.params.userId) {
                return next( new ForbiddenError('User does not have permission') );
            }
            
            // This should return a document if it succeeded
            const deletedUser = userService.deleteUserById(req.params.userId);
            console.log(deletedUser);
            
            return res.sendStatus(StatusCodes.OK);
        } catch (error) {
            next(error);
        }
    });

    /**
     * POST - Create a user
     * Permissions: Only the Admin can create a user
     * @param {Object} payload - Creates a user using the information defined in the payload
     * @returns {User} - Returns a newly created User object
     * */
    userRouter.post('/users', authService.isAdmin, csrfProtection, userValidator.createUserValidatorChain, async (req, res, next) => {
        try {
            const errors = validationResult(req);
            console.log(errors)
            if (!errors.isEmpty()) {
                return next( new ValidationError('User validation failed', errors.array()) );
            }
            
            console.log('Creating user')
            const newUser = await userService.createUser(req.body);
            
            return res.status(StatusCodes.CREATED).json({ user: newUser });
        } catch (error){
            next(error);
        }
    });

    // TODO: Need to implement Rate Limiter for Login
    /**
     * POST - Login
     * Authenticates user using their credentials and creates an accessToken & refreshToken
     * @param {Object} payload - Username & Password
     * @returns accessToken
     * @returns refreshToken
     * */
    userRouter.post('/login', async (req, res, next) => {
        try {
            const existingUser = await userService.getUser({ username: req.body.username });

            if (existingUser && await bcrypt.compare(req.body.password, existingUser.password)) {
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
                next( new AuthenticationError('Invalid credentials', 0) );
            }

        } catch (error) {
            next(error);
        }
    });

    /**
     * GET - CSRF Token
     * Retrieves CSRF token for the session
     * Permissions: User must be logged to retrieve a session token
     * @returns csrfToken
     * */
    userRouter.get('/form', authService.isStudent, csrfProtection, async (req, res, next) => {
        res.json({ csrfToken: req.csrfToken() });
    })

    /**
     * POST - Refresh Token
     * Refreshes accessToken using the refreshToken
     * @param refreshToken
     * @returns accessToken
     * */
    userRouter.post('/token', async (req, res, next) => {
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
            next(error);
        }
    });

    /**
     * POST - Logout
     * Clears AuthTokens and revokes access by deleting it from the whitelist stored in the database
     * @param refreshToken
     * @param accessToken
     * @param csrfToken
     * */
    userRouter.post('/logout', async (req, res, next) => {
        try {
            const revokedToken = await authService.deleteRefreshToken(req.signedCookies.refreshToken);
            console.log(revokedToken);
            
            res.clearCookie('_csrf');
            res.clearCookie('refreshToken');
            res.clearCookie('refreshTokenFingerprint');
            res.clearCookie('accessTokenFingerprint');

            return res.sendStatus(StatusCodes.OK);
        } catch (error) {
            next(error);
        }
    })

    /**
     * DELETE - Delete tokens created before from DB whitelist 
     * Clears AuthTokens and revokes access by deleting it from the whitelist stored in the database
     * Permissions: Only the Admin can revoke Tokens
     * @param refreshToken
     * @param accessToken
     * @param csrfToken
     * */
    userRouter.delete('/tokens', authService.isAdmin, csrfProtection, async (req, res, next) => {
        try {
            const { revocationDate } = req.query;
            await authService.deleteAllRefreshTokens({ creationDate: { $lt: revocationDate } })
            
        } catch (error) {
            next(error);
        }
    })
    
    return userRouter;
}

export default makeRouter;