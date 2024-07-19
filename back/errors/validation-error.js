import {StatusCodes} from 'http-status-codes';

export class ValidationError extends Error {
    constructor(message, errors) {
        super(message);
        this.name = 'ValidationError';
        this.errors = errors;
        this.code = StatusCodes.BAD_REQUEST;
    }
}