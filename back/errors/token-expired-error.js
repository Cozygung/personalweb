import {StatusCodes} from 'http-status-codes';

/**
 * @param {String} message - Error Message
 * @param {Number} type
 * Type = 0: Misc (Login Failed, etc)
 * Type = 1: AuthToken -> Need to refresh AccessToken
 * Type = 2: RefreshToken -> User needs to re-authenticate
 * */
export class TokenExpiredError extends Error {
    constructor(message, type) {
        super(message);
        this.code = StatusCodes.UNAUTHORIZED;
        this.type = type;
        this.name = 'TokenExpiredError';
    }
}