// TODO: DAO should only consist of ADD UPDATE DELETE 
class TokenDao {
    #tokenModel; 
    
    constructor(tokenModel) {
        this.#tokenModel = tokenModel;
    }
    async isValidRefreshToken(refreshToken) {
        return await this.#tokenModel.exists({ refreshToken: refreshToken })
    };

    async addRefreshToken(refreshToken) {
        const tokenInstance = new this.#tokenModel(refreshToken);
        await tokenInstance.save();

        return tokenInstance
    };

    async getRefreshTokenByUserId(userId) {
        const query = {
            userId: userId,
            expireDate: { $gt: new Date() } // Grab the refreshToken only if it is not expired
        };

        // Grab the refreshToken only
        const result = await this.#tokenModel.findOne(query, { refreshToken: 1 });

        return result ? result.refreshToken : null;
    };

    async deleteRefreshToken(query, options) {
        return await this.#tokenModel.findOneAndDelete(query, options)
    }

    async deleteManyRefreshTokens(query) {
        return await this.#tokenModel.deleteMany(query)
    }

    async getRefreshTokenByUserIdAndUpdate(userId, updates) {
        return await this.#tokenModel.findOneAndUpdate({userId: userId}, updates, { new: true, useFindAndModify: false })
    }

    async getRefreshTokenAndUpdate(filter, update, options) {
        return await this.#tokenModel.findOneAndUpdate(filter, update, options)
    }
    
    // DEVICE METHODS

    async getDevice(userId, deviceQuery) {
        const query = {
            userId: userId,
            'devices': { $elemMatch: deviceQuery }
        };

        const result = await this.#tokenModel.findOne(query, { 'devices.$': 1 });

        return result ? result.devices[0] : null;
    }
}

export default TokenDao;
