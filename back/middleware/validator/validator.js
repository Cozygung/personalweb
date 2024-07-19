import mongoose from 'mongoose';

class Validator {
    isValidId = (id) => {
        return mongoose.isValidObjectId(id);
    }
}

export default Validator;