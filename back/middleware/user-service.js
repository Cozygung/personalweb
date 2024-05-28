import invalid from "./validator.js";
import {ReasonPhrases, StatusCodes} from "http-status-codes";

class UserService {
    #userDAO;
    #departmentDAO;

    constructor(userDAO) {
        this.#userDAO = userDAO;
    }

    async validator(req, res, next) {
        const { username, password } = req.body;
        const format = /^[A-Za-z0-9]*$/;

        if (!format.test(username)){
            return res.status(StatusCodes.NOT_ACCEPTABLE).send({error: "Username can not contain special characters"});
        }

        if (password.length < 8 || password.toLowerCase().includes('password')){
            return res.status(StatusCodes.NOT_ACCEPTABLE).send({error: "Password format not acceptable."});
        }
        
        next();
    }

    async checkUniqueUsername(req, res, next) {
        const { username } = req.body;
        console.log(username);

        if (!await this.#userDAO.checkUniqueUsername(username)){
            return res.status(StatusCodes.CONFLICT).send({error: "Username not unique"});
        }

        next();
    }

    async createUser(user) {
        const userInstance = await this.#userDAO.createUser(user)

        console.log("User created " + userInstance);
        return userInstance
    }

    async getUserById(req, res, next) {
        try {
            const userId = req.params.userId

            if (invalid(userId)) {
                console.log("UserId is invalid: " + userId);
                return null
            }
            
            const user = await this.#userDAO.getUserById(userId);

            if (!user) {
                return res
                    .status(StatusCodes.NOT_FOUND)
                    .send({ error: ReasonPhrases.NOT_FOUND });
            }

            req.user = user;
            next();
            
        } catch (error) {
            return res.status(StatusCodes.BAD_REQUEST).send({ error: error.message });
        }
    };

    async getUserList(req, res, next) {
        try {
            const queryFilter = req.body.query;
            
            req.userList = await this.#userDAO.getUserList(queryFilter)
            next();
            
        } catch (error) {
            return res.status(StatusCodes.BAD_REQUEST).send({ error: error.message });
        }
    }

    async updateUser(req, res, next) {
        try {
            const userId = req.params.userId;
            const updates = req.body;
            
            if (invalid(userId)) {
                console.log("UserId is invalid: " + userId);
                return null
            }

            req.user = await this.#userDAO.updateUser(userId, updates);
            next();
            
        } catch (error) {
            return res.status(StatusCodes.BAD_REQUEST).send({ error: error.message });
        }
    };

    async deleteUserById(req, res, next) {
        try {
            const user = req.user;
            const paramUserId = req.params.userId;
            
            // Only the Admin or the user who owns the account can delete their account
            if (user.userType !== "Admin" && user._id !== paramUserId) {
                return res
                    .status(StatusCodes.FORBIDDEN)
                    .send( { error: ReasonPhrases.FORBIDDEN });
            }
            
            const deletedUser = await this.#userDAO.deleteUserById(paramUserId);
            console.log("User deleted: " + deletedUser);
            
            // await Course.deleteMany({teachers: {$elemMatch: {_id: userId}}});

            next();
        } catch (error) {
            return res.status(StatusCodes.BAD_REQUEST).send({ error: error.message });
        }
    }
}

export default UserService;