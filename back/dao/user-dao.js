class UserDao {
    #userModel; // Private Field (Can't be accessed or seen from outside)

    constructor(userModel) {
        this.#userModel = userModel;
    }
    checkUniqueUsername(username) {
        const alreadyExists = this.#userModel.findOne({ username: username });

        return !alreadyExists
    };

    createUser(user) {
        const userInstance = new this.#userModel(user);
        userInstance.save();

        return userInstance
    };

    getUserById(userId) {
        return this.#userModel.findById(userId);
    };

    getUserList(queryFilter) {
        return this.#userModel.find(queryFilter)
    };

    updateUser(userId, userUpdates) {
        return this.#userModel.findByIdAndUpdate(userId, userUpdates, { new: true })
    };

    deleteUserById(userId) {
        return this.#userModel.findByIdAndDelete(userId)
    }
}

export default UserDao;
