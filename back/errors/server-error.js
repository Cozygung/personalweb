import {StatusCodes} from 'http-status-codes';

export class ServerError extends Error {
    constructor(message) {
        super(message);
        this.code = StatusCodes.INTERNAL_SERVER_ERROR;
        this.name = 'ServerError';
    }
}