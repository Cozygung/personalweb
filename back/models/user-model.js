// TODO: Store a list of Valid IP Addresses
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
            minlength: 8,
            trim: true,
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