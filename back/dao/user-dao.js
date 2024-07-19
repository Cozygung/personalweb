class UserDao {
    #userModel; // Private Field (Can't be accessed or seen from outside)

    constructor(userModel) {
        this.#userModel = userModel;
    }
    async checkUniqueUsername(username) {
        const isUnique = !await this.#userModel.findOne({ username: username })

        return isUnique
    };

    async createUser(user) {
        const userInstance = new this.#userModel(user);
        await userInstance.save();

        return userInstance
    };

    async getUserById(userId) {
        return await this.#userModel.findById(userId)
    };
    
    async getUser(queryFilter) {
        return await this.#userModel.findOne(queryFilter)
    }

    async getUserList(queryFilter) {
        return await this.#userModel.find(queryFilter)
    };

    async updateUser(userId, userUpdates) {
        return await this.#userModel.findByIdAndUpdate(userId, userUpdates, { new: true })
    };

    async deleteUserById(userId) {
        return await this.#userModel.findByIdAndDelete(userId)
    }
    
    getUserTypeEnumList() {
        return this.#userModel.schema.path('userType').enumValues
    }
}

export default UserDao;
