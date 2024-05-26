import invalid from "./validator.js";

class UserService {
    #userDAO;
    #departmentDAO;

    constructor(userDAO) {
        this.#userDAO = userDAO;
    }

    async checkUniqueUsername(username) {
        return this.#userDAO.checkUniqueUsername(username)
    }

    async createUser(user) {        
        const userInstance = this.#userDAO.createUser(user)

        console.log("User created " + userInstance);
        return userInstance
    }

    async getUserById(userId) {
        if (invalid(userId)) {
            console.log("UserId is invalid: " + userId);
            return null
        }
        return this.#userDAO.getUserById(userId);
    };

    async getUserList(queryFilter) {
        return this.#userDAO.getUserList(queryFilter)
    }

    async updateUser(userId, userUpdates) {
        if (invalid(userId)) {
            console.log("UserId is invalid: " + userId);
            return null
        }
        return this.#userDAO.updateUser(userId, userUpdates)
    };

    async deleteUserById(userId) {
        return this.#userDAO.deleteUserById(userId)
    }
}

export default UserService;