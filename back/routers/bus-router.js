import express from 'express';

// TODO: Add Versioning to API endpoints
const makeRouter = (csrfProtection, busController) => {
    const busRouter = express.Router();

    busRouter.post('/v1/walk-paths', csrfProtection, busController.addWalkPaths)
    
    busRouter.post('/v1/bus-routes', csrfProtection, busController.addBusRoutes)
    
    return busRouter
}

export default makeRouter;