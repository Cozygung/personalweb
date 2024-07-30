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
            expireDate: { $gt: new Date() } // Only grab the refreshToken if it is not expired
        };

        const result = await this.#tokenModel.findOne(query, { refreshToken: 1 }); // Only grab the refreshToken

        return result ? result.refreshToken : null;
    };

    async deleteRefreshToken(query) {
        return await this.#tokenModel.findOneAndDelete(query, { new: true })
    }

    async deleteAllRefreshTokens(query) {
        return await this.#tokenModel.deleteMany(query)
    }

    async getRefreshTokenByUserIdAndUpdate(userId, updates) {
        return await this.#tokenModel.findOneAndUpdate({userId: userId}, updates, { new: true, useFindAndModify: false })
    }
    
    async getDevice(userId, deviceQuery) {
        const query = {
            userId: userId,
            'devices': { $elemMatch: deviceQuery } // Use $elemMatch to match devices in the array
        };
        
        const result = await this.#tokenModel.findOne(query, { 'devices.$': 1 }); // Use the positional operator

        return result ? result.devices[0] : null;
    }

    async addDevice(userId, device) {
        return await this.#tokenModel.findOneAndUpdate({userId: userId}, { $push: { devices: device } }, { new: true, useFindAndModify: false })
    };
    
    async removeDevice(userId, deviceId) {
        return await this.#tokenModel.findOneAndUpdate(
            { userId: userId },
            { $pull: { devices: { _id: deviceId } } }, // Use $pull to remove the device
            { new: true, useFindAndModify: false } // Return the updated document
        );
    }
}

export default TokenDao;
