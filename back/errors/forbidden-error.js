import {StatusCodes} from 'http-status-codes';

export class ForbiddenError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ForbiddenError';
        this.code = StatusCodes.FORBIDDEN;
    }
}