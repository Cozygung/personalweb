import express from 'express';

// TODO: Add Versioning to API endpoints
const makeRouter = (csrfProtection, authService, userController, userValidator) => {
    const userRouter = express.Router();

    /** 
     * GET - Get User list
     * Get a list of users following the characteristics defined in 'query'
     * Permissions: Teachers and Admins have access
     * @param {User.<string, any>} payload - Search query containing User fields
     * @returns {User[]} - List of Users
     * */
    userRouter.get('/v1/users', authService.isTeacher, userController.getUserList);

    /**
     * GET - Get User
     * Get a user with userId = 'userId'
     * Permissions: Students can access their own information. Teachers and Admins have access to all students.
     * @param {String} userId - User ID
     * @returns {User} - A User object
     * */
    userRouter.get('/v1/users/:userId', authService.isStudent, userController.getUser);

    /**
     * PATCH - Update existing User
     * Update a user with userId = 'userId' using the updates defined in 'updates'
     * Permissions: Students and Teachers can update their own profile. Admins can update all profiles.
     * @param {String} userId - User ID
     * @param {User.<string, any>} payload - A set of fields and their new values
     * @returns {User} - Updated User object
     * */
    userRouter.patch('/v1/users/:userId', authService.isStudent, csrfProtection, userValidator.updateUserValidatorChain, 
        userController.updateUser);

    /**
     * DELETE - Delete existing User
     * Delete a user with userId = 'userId'
     * Permissions: Students and Teachers can delete their own profile. Admins can delete all profiles.
     * @param {String} userId - User ID
     * */
    userRouter.delete('/v1/users/:userId', authService.isStudent, csrfProtection, userController.deleteUser);

    /**
     * POST - Create a user
     * Permissions: Only the Admin can create a user
     * @param {Object} payload - Creates a user using the information defined in the payload
     * @returns {User} - Returns a newly created User object
     * */
    userRouter.post('/v1/users', authService.isAdmin, csrfProtection, userValidator.createUserValidatorChain, 
        userController.createUser);

    // TODO: Need to implement Rate Limiter for Login
    /**
     * POST - Login
     * Authenticates user using their credentials and creates an accessToken & refreshToken
     * @param {Object} payload - Username & Password
     * @returns accessToken
     * @returns refreshToken
     * */
    userRouter.post('/login', csrfProtection, userController.login);

    /**
     * GET - CSRF Token
     * Retrieves CSRF token for the session
     * @returns csrfToken
     * */
    userRouter.get('/form', csrfProtection, async (req, res, next) => {
        res.json({ csrfToken: req.csrfToken() });
    })

    /**
     * POST - Refresh Token
     * Refreshes accessToken using the refreshToken
     * Permissions: We can't restrict auth permissions here 
     * @param refreshToken
     * @returns accessToken
     * */
    userRouter.post('/token', csrfProtection, userController.refreshToken);
    
    /**
     * POST - Logout
     * Clears AuthTokens and revokes access by deleting it from the whitelist stored in the database
     * Permissions: User must be logged in to logout
     * @param refreshToken
     * @param accessToken
     * @param csrfToken
     * */
    userRouter.post('/logout', authService.isStudent, userController.logout)

    /**
     * DELETE - Delete tokens created before the specified date from DB whitelist 
     * Clears AuthTokens and revokes access by deleting it from the whitelist stored in the database
     * Permissions: Only the Admin can revoke Tokens
     * @param refreshToken
     * @param accessToken
     * @param csrfToken
     * */
    userRouter.delete('/tokens', authService.isAdmin, csrfProtection, userController.deleteAllTokens)

    userRouter.get('/test', userController.test)

    userRouter.get('/redirected', userController.redirected);
    
    
    
    return userRouter;
}

export default makeRouter;