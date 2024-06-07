import { param, body, validationResult } from "express-validator";
import Validator from "./validator.js";
import {StatusCodes} from "http-status-codes";

class UserValidator extends Validator {
    #userDAO;
    constructor(userDAO) {
        super();
        this.#userDAO = userDAO;
    }
    isValidUserId = () => param("userId").trim()
        .isString()
        .isMongoId()
        .custom(value => this.#userDAO.findById(value));

    isValidUsername = () => body("username").trim().notEmpty().withMessage("Username cannot be empty")
        .isString()
        .isLength({max: 24}).withMessage("Username cannot exceed 24 characters")
        .custom(value => /^[A-Za-z0-9]*$/.test(value)).withMessage("Username cannot contain symbols");
    
    isValidName = (name) => body(name).trim().notEmpty().withMessage("Name cannot be empty")
        .isString()
        .isLength({max: 24}).withMessage("Name cannot exceed 24 characters")
        .custom(value => /^[A-Za-z0-9]*$/.test(value)).withMessage("Name cannot contain symbols");

    isValidPassword = () => body("password").trim()
        .isString()
        .isStrongPassword({
            minLength: 8,
            minLowercase: 1,
            minUppercase: 1,
            minNumbers: 1,
            minSymbols: 0
        }).withMessage("Password must be at least 8 characters and have at least one lowercase character, " +
            "one uppercase character, and have a number")
        .custom(value => !value.toLowerCase().includes('password')).withMessage("Password cannot contain 'password'");
    
    isValidUserType = () => body("userType")
        .isString()
        .custom(value => ['Admin','Teacher', 'Student'].includes(value)).withMessage("Invalid UserType");
    
    updateUserValidatorChain = async (req, res, next) => {
        const fieldsToValidate = Object.keys(req.body);

        const validationChain = fieldsToValidate.map(field => {
            switch (field) {
                case "username":
                    return this.isValidUsername()
                case "firstName":
                    return this.isValidName("firstName")
                case "lastName": 
                    return this.isValidName("lastName")
                case "password":
                    return this.isValidPassword()
                case "userType": 
                    return this.isValidUserType()
                default:
                    return null;
            }
        });
        if (validationChain.some(validation => validation === null)) {
            return res.status(StatusCodes.BAD_REQUEST).json({ errors: "User object contains incorrect fields" });
        }
        
        await Promise.all(validationChain.map(validation => validation(req, res, () => {})));

        // Check for validation errors
        const errors = validationResult(req);
        console.log(errors)
        if (!errors.isEmpty()) {
            return res.status(StatusCodes.BAD_REQUEST).json({ errors: errors.array() });
        }

        next(); 
    }
    

}

export default UserValidator;