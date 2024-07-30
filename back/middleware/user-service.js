import bcrypt from 'bcrypt';
import {NotFoundError} from '../errors/not-found-error.js';
import {ConflictError} from "../errors/conflict-error.js";
import {ServerError} from "../errors/server-error.js";

class UserService {
    #userDAO;

    constructor(userDAO) {
        this.#userDAO = userDAO;
    }

    async checkUniqueUsername(username) {
        return await this.#userDAO.checkUniqueUsername(username)
    };

    async createUser(user) {
        user.password = await bcrypt.hash(user.password, 12);
        const userInstance = await this.#userDAO.createUser(user).catch((error) => {
            console.log("Create User Error: ", error);
            if (error.code === 11000) {
                throw new ConflictError('This username is taken! Pick another username');
            } else {
                throw new ServerError(error.message);
            }
        })
        console.log('User created ' + userInstance);
        
        return userInstance
    }

    async getUserById(userId) {
        const user = await this.#userDAO.getUserById(userId);
        
        return user
    };
    
    async getUser(queryFilter) {
        const user = await this.#userDAO.getUser(queryFilter);
        
        return user
    }

    // TODO: Implement filtering, sorting, and pagination
    async getUserList(filter, limit = 20, page = 1, sortBy) {
        return await this.#userDAO.getUserList(filter, limit, page, sortBy)
    }

    async updateUser(userId, updates) {
        const updatedUser = await this.#userDAO.updateUser(userId, updates);
        if (!updatedUser) {
            throw new NotFoundError(`User ${userId} does not exist`);
        }
        return updatedUser
    };

    async deleteUserById(userId) {
        const deletedUser = await this.#userDAO.deleteUserById(userId);
        if (!deletedUser) {
            throw new NotFoundError(`User ${userId} does not exist`);
        }
        
        return deletedUser;
        // TODO: await Course.deleteMany({teachers: {$elemMatch: {_id: userId}}});
    }
    
    /**
     * @returns a positive number if userTypeA is higher privilege than userTypeB
     * */
    compareUserType(userTypeA, userTypeB) {
        const userTypeEnumList = this.#userDAO.getUserTypeEnumList();
        return userTypeEnumList.indexOf(userTypeA) - userTypeEnumList.indexOf(userTypeB);
    }

    getUserTypeEnumList() {
        return this.#userDAO.getUserTypeEnumList();
    }
}

export default UserService;