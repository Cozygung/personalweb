/**
 * Represents a user in the system.
 * @typedef {Object} User
 * @property {string} username - Username | Must be unique.
 * @property {string} firstname - First Name
 * @property {string} lastname - Last Name
 * @property {string} password - password | Length > 8 
 * @property {string} userType - User Privilege | Admin or Teacher or Student
 */

export const userPrivileges = ['Admin','Teacher', 'Student'];

const makeModel = (ODM) => {
    const userSchema = new ODM.Schema({
        username: {
            type: String,
            unique: true,
            required: true,
            maxlength: 16,
            trim: true,
        },
        firstName: {
            type: String,
            required: true,
            maxlength: 24,
            trim: true,
        },
        lastName: {
            type: String,
            required: true,
            maxlength: 24,
            trim: true,
        },
        // No maxlength because password is encrypted
        password: {
            type: String,
            required: true,
            minlength: 8,
            trim: true,
        },
        userType: {
            type: String,
            default: 'Student',
            enum: userPrivileges
        },
    });
    
    return ODM.model('User', userSchema);
}

export default makeModel;