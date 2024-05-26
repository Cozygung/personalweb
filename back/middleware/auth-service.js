import jwt from "jsonwebtoken";
import { StatusCodes } from "http-status-codes";

class AuthService {
    authenticateToken(req, res, next) {
        const authHeader = req.headers["authorization"];
        const token = authHeader && authHeader.split(" ")[1];
        if (token == null) return res.sendStatus(StatusCodes.UNAUTHORIZED);
        jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
            if (err) return res.sendStatus(StatusCodes.FORBIDDEN);
            req.user = user;
            next();
        });
    };

    isStudent(req, res, next) {
        this.authenticateToken(req, res, () => {
            if (
                req.user.userType === "Student" ||
                req.user.userType === "Teacher" ||
                req.user.userType === "Admin"
            ) {
                next();
            } else {
                res.sendStatus(StatusCodes.FORBIDDEN);
            }
        });
    };

    isTeacher(req, res, next) {
        this.authenticateToken(req, res, () => {
            if (
                req.user.userType === "Teacher" ||
                req.user.userType === "Admin"
            ) {
                next();
            } else {
                res.sendStatus(StatusCodes.FORBIDDEN);
            }
        });
    };

    isAdmin(req, res, next) {
        this.authenticateToken(req, res, () => {
            if (req.user.userType === "Admin") {
                next();
            } else {
                res.sendStatus(StatusCodes.FORBIDDEN);
            }
        });
    };
}

export default AuthService;