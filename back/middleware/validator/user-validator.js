import { body } from 'express-validator';

class UserValidator {
    #userService;
    
    constructor(userService) {
        this.#userService = userService;
    }
    
    // Validator Chains for an operation (Update, Delete, Create)
    createUserValidatorChain = [
        body('username').trim()
            .notEmpty().withMessage('Username cannot be empty')
            .isString()
            .isLength({max: 24}).withMessage('Username cannot exceed 24 characters')
            .custom(value => /^[A-Za-z0-9]*$/.test(value)).withMessage('Username cannot contain symbols')
            .custom(async (value) => {
                return await new Promise(async (resolve, reject) => {
                    const isUnique = await this.#userService.checkUniqueUsername(value)
                    if (!isUnique) {
                        reject('')
                    }
                    resolve(true)
                })
            }).withMessage('Username is not unique'),
        
        body('firstName').trim()
            .notEmpty().withMessage('FirstName cannot be empty')
            .isString()
            .isLength({max: 24}).withMessage('Name cannot exceed 24 characters')
            .custom(value => /^[A-Za-z0-9]*$/.test(value)).withMessage('Name cannot contain symbols'),
        
        body('lastName').trim()
            .notEmpty().withMessage('LastName cannot be empty')
            .isString()
            .isLength({max: 24}).withMessage('Name cannot exceed 24 characters')
            .custom(value => /^[A-Za-z0-9]*$/.test(value)).withMessage('Name cannot contain symbols'),
        
        body('password').trim()
            .isString()
            .isStrongPassword({
                minLength: 8,
                minLowercase: 1,
                minUppercase: 1,
                minNumbers: 1,
                minSymbols: 0
            }).withMessage('Password must be at least 8 characters and have at least one lowercase character, ' +
            'one uppercase character, and have a number')
            .isLength({max: 32}).withMessage('Password cannot exceed 32 characters')
            .custom(value => !value.toLowerCase().includes('password')).withMessage('Password cannot contain "password"'),
        
        body('userType')
            .isString()
            .custom(value => this.#userService.getUserTypeEnumList().includes(value)).withMessage('Invalid UserType')
            .custom(async (value, {req}) => {
                return await new Promise(async (resolve, reject) => {
                    // If the user being created has higher privilege than the user making this call
                    if (this.#userService.compareUserType(value, req.user.userType) > 0) {
                        reject();
                    }

                    resolve(true);
                })
            }).withMessage('You do not have the privileges to create this type user')
    ];
    
    updateUserValidatorChain = [
        body('username').trim().optional()
            .isString()
            .isLength({max: 24}).withMessage('Username cannot exceed 24 characters')
            .custom(value => /^[A-Za-z0-9]*$/.test(value)).withMessage('Username cannot contain symbols')
            .custom(async (value, {req}) => {
                // Check if username is unique OR if the existing username belongs to the User we are updating
                return await new Promise(async (resolve, reject) => {
                    const existingUser = await this.#userService.getUser({ username: value });
                    
                    if (!existingUser || existingUser._id.toString() === req.params._id) {
                        resolve(true)
                    }
                    reject('')
                })
            }).withMessage('Username is not unique'),
        
        body('firstName').trim().optional()
            .isString()
            .isLength({max: 24}).withMessage('Name cannot exceed 24 characters')
            .custom(value => /^[A-Za-z0-9]*$/.test(value)).withMessage('Name cannot contain symbols'),
        
        body('lastName').trim().optional()
            .isString()
            .isLength({max: 24}).withMessage('Name cannot exceed 24 characters')
            .custom(value => /^[A-Za-z0-9]*$/.test(value)).withMessage('Name cannot contain symbols'),
        
        body('password').trim().optional()
            .isString()
            .isStrongPassword({
                minLength: 8,
                minLowercase: 1,
                minUppercase: 1,
                minNumbers: 1,
                minSymbols: 0
            }).withMessage('Password must be at least 8 characters and have at least one lowercase character, ' +
            'one uppercase character, and have a number')
            .isLength({max: 32}).withMessage('Password cannot exceed 32 characters')
            .custom(value => !value.toLowerCase().includes('password')).withMessage('Password cannot contain "password"'),
        
        body('userType').optional()
            .isString()
            .custom(value => this.#userService.getUserTypeEnumList().includes(value)).withMessage('Invalid UserType')
            .custom(async (value, {req}) => {
                return await new Promise(async (resolve, reject) => {
                    const user = await this.#userService.getUserById(req.params.userId);
                    const USER_TYPES = this.#userService.getUserTypeEnumList();

                    // If user does not have Admin+ privilege
                    // AND If userType value in the update query is not the same as its original value
                    if (this.#userService.compareUserType(USER_TYPES[0], req.user.userType) < 0 && value !== user.userType) {
                        reject();
                    }
                    
                    // If the user being updated has an equal or higher privilege than the user making this call
                    // AND the user being updated is not the user making this call
                    if (this.#userService.compareUserType(user.userType, req.user.userType) >= 0 && user._id.toString() !== req.user._id) {
                        reject();
                    }
                    
                    // If the user is trying to give another user a privilege that is higher than their own
                    if (this.#userService.compareUserType(value, req.user.userType) > 0) {
                        reject();
                    }
                    
                    resolve(true);
                })
            }).withMessage('You do not have the privileges to perform this update')
    ];
    

}

export default UserValidator;