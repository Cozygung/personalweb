class TokenDao {
    #tokenModel; 

    constructor(tokenModel) {
        this.#tokenModel = tokenModel;
    }
    async isValidRefreshToken(refreshToken) {
        const isValid = await this.#tokenModel.findOne({ refreshToken: refreshToken });

        return !!isValid
    };

    async activateRefreshToken(refreshToken) {
        const tokenInstance = new this.#tokenModel(refreshToken);
        await tokenInstance.save();

        return tokenInstance
    };

    async getRefreshTokenByUsername(username) {
        return await this.#tokenModel.findOne({ username: username })
    };

    async getRefreshTokenList(queryFilter) {
        return await this.#tokenModel.find(queryFilter)
    };

    async updateRefreshToken(tokenId, tokenUpdates) {
        return await this.#tokenModel.findByIdAndUpdate(tokenId, tokenUpdates, { new: true })
    };

    async revokeRefreshToken(query) {
        return await this.#tokenModel.findOneAndDelete(query)
    }

    async revokeAllRefreshTokens(query) {
        return await this.#tokenModel.deleteMany(query)
    }
}

export default TokenDao;
