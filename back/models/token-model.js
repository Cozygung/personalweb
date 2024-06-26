// TODO: Store a list of Valid IP Addresses
// TODO: Use Key Management services Cloud providers like AWS, Google Cloud Platform, and Azure
// TODO: USe Secrets Management Tools like HashiCorp Vault, AWS Secrets Manager, and Azure Key Vault

// This will be used to create the token revocation list    
const makeModel = (ODM) => {
    const tokenSchema = new ODM.Schema({
        refreshToken: {
            type: String,
            required: true
        },
        username: {
            type: String,
            required: true,
            unique: true
        },
        expireDate: {
            type: Date,
            required: true
        }
    });

    return ODM.model('JWT-Refresh-Token', tokenSchema);
}

export default makeModel;