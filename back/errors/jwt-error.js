import {StatusCodes} from 'http-status-codes';

/**
 * @param {String} message - Error Message
 * @param {Number} type
 * Type = 0: Login Failed
 * Type = 1: AuthToken -> Need to refresh AccessToken
 * Type = 2: RefreshToken -> User needs to re-authenticate
 * */
export class JsonWebTokenError extends Error {
    constructor(message, type) {
        super(message);
        this.name = 'JsonWebTokenError';
        this.code = StatusCodes.UNAUTHORIZED;
        this.type = type;
    }
}