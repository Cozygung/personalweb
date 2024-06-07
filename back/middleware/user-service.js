import { ReasonPhrases, StatusCodes } from "http-status-codes";
import bcrypt from "bcrypt";
import { ServerError } from "../errors/server-error.js";

class UserService {
    #userDAO;

    constructor(userDAO) {
        this.#userDAO = userDAO;
    }

    async createUser(user) {
        if (!await this.#userDAO.checkUniqueUsername(user.username)) {
            throw new ServerError(StatusCodes.NOT_ACCEPTABLE, "Username is not unique");
        }
        
        user.password = await bcrypt.hash(user.password, 12);
        const userInstance = await this.#userDAO.createUser(user)
        console.log("User created " + userInstance);
        return userInstance
    }

    async getUserById(userId) {
        const user = await this.#userDAO.getUserById(userId);
        if (!user) {
            throw new ServerError(StatusCodes.NOT_FOUND, ReasonPhrases.NOT_FOUND)
        }
        return user
    };
    
    async getUser(queryFilter) {
        const user = await this.#userDAO.getUser(queryFilter);
        if (!user) {
            throw new ServerError(StatusCodes.NOT_FOUND, ReasonPhrases.NOT_FOUND)
        }
        return user
    }

    async getUserList(queryFilter) {
        return await this.#userDAO.getUserList(queryFilter)
    }

    async updateUser(userId, updates) {
        return await this.#userDAO.updateUser(userId, updates)
    };

    async deleteUserById(userId) {
        const user = this.#userDAO.getUserById(userId);
        
        // Only the Admin or the user who owns the account can delete their account
        if (user.userType !== "Admin" && user._id !== userId) {
            throw new ServerError(StatusCodes.FORBIDDEN, ReasonPhrases.FORBIDDEN)
        }
        
        const document = await this.#userDAO.deleteUserById(userId);
        console.log("User deleted: " + document);
        
        // await Course.deleteMany({teachers: {$elemMatch: {_id: userId}}});
        
        return document
    }
}

export default UserService;