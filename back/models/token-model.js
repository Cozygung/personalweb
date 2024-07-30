// TODO: Store a list of Valid IP Addresses
// TODO: Use Key Management services Cloud providers like AWS, Google Cloud Platform, and Azure
// TODO: USe Secrets Management Tools like HashiCorp Vault, AWS Secrets Manager, and Azure Key Vault


// This will be used to create the token revocation list
import {userPrivileges} from "./user-model.js";

const makeModel = (ODM) => {
    const deviceSchema = new ODM.Schema({
        _id: {
            type: ODM.Schema.Types.ObjectId,
            unique: true,
            required: true
        },
        userAgent: {
            ua: {
                type: String,
                required: true
            },
            browser: {
                name: {
                    type: String,
                    required: true
                },
                version: {
                    type: String,
                    required: true
                },
                major: {
                    type: String,
                    required: true
                }
            },
            engine: {
                name: {
                    type: String,
                },
                version: {
                    type: String,
                },
            },
            os: {
                name: {
                    type: String,
                    required: true
                },
                version: {
                    type: String,
                    required: true
                },
            },
            device: {
                type: Object
            },
            cpu: {
                architecture: {
                    type: String,
                    required: true
                },
            },
        },
        windowScreen: {
            width: {
                type: Number,
                required: true
            },
            height: {
                type: Number,
                required: true
            },
            colorDepth: {
                type: Number,
                required: true
            }
        },
        webGLInfo: {
            vendor: {
                type: String,
                required: true
            },
            renderer: {
                type: String,
                required: true
            },
            version: {
                type: String,
                required: true
            },
        },
        heapSizeLimit: {
            type: Number,
        }
    });
    
    const tokenSchema = new ODM.Schema({
        refreshToken: {
            type: String,
            required: true,
            unique: true
        },
        creationDate: {
            type: Date,
            default: Date.now,
        },
        expireDate: {
            type: Date,
            required: true
        },
        userId: {
            type: ODM.Schema.Types.ObjectId,
            ref: 'User'
        },
        devices: [deviceSchema],
        loginHistory: [{
            ipAddress: String,
            action: {
                type: String,
                required: true,
                enum: ['LOGIN', 'REFRESH', 'LOGOUT']
            },
            deviceId: {
                type: ODM.Schema.Types.ObjectId,
            },
            location: {
                city: String,
                country: String,
                latitude: Number,
                longitude: Number
            },
            timestamp: { type: Date, default: Date.now }
        }]
    });

    tokenSchema.index({ userId: 1 });

    return ODM.model('JWT-Refresh-Token', tokenSchema);
}

export default makeModel;