import {StatusCodes} from 'http-status-codes';

export class ConflictError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ConflictError';
        this.code = StatusCodes.CONFLICT;
    }
}