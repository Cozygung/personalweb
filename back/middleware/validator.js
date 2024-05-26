import mongoose from "mongoose";

function invalidId(id) {
    const valid = mongoose.isValidObjectId(id);
    
    return !valid;
}

export default invalidId;
