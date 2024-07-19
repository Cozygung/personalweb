import {StatusCodes} from 'http-status-codes';

/**
 * @param {String} message - Error Message
 * @param {Number} type
 * Type = 0: Login Failed
 * Type = 1: AuthToken -> Need to refresh AccessToken
 * Type = 2: RefreshToken -> User needs to re-authenticate
 * */
export class AuthenticationError extends Error {
    constructor(message, type) {
        super(message);
        this.name = 'AuthenticationError';
        this.type = type;
        this.code = StatusCodes.UNAUTHORIZED;
    }
}