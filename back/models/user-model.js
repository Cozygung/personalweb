// import validator from 'validator';
// import bcrypt from 'bcryptjs'; // Password encryption

const makeModel = (ODM) => {
    const userSchema = new ODM.Schema({
        username: {
            type: String,
            unique: true,
            required: true
        },
        firstName: {
            type: String,
            required: true,
        },
        lastName: {
            type: String,
            required: true,
        },
        password: {
            type: String,
            required: true,
            minlength: 8,
            trim: true,
            validator(value) {
                if (value.toLowerCase().includes('password')) {
                    throw new Error("Password cannot contain 'password'.");
                }
            }
        },
        userType: {
            type: String,
            default: 'Student',
            enum: ['Admin','Teacher', 'Student']
        },
    });
    
    return ODM.model('User', userSchema);
}

export default makeModel;