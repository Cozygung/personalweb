import {StatusCodes} from 'http-status-codes';

export class NotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = 'NotFoundError';
        this.code = StatusCodes.NOT_FOUND;
    }
}