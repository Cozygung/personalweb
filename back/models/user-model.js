/**
 * Represents a user in the system.
 * @typedef {Object} User
 * @property {String} username - Username | Must be unique.
 * @property {String} firstname - First Name
 * @property {String} lastname - Last Name
 * @property {String} password - password | Length > 8 
 * @property {String} userType - User Privilege | Admin or Teacher or Student
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
        password: {
            type: String,
            required: true,
            minlength: 8, // No maxlength because password is encrypted
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