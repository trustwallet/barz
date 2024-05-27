# Barz Multi-sig Facet Signature Format
## Signature
This is the format of the Signature for the UserOperation validation during the Tx execution.

Each Signature is comprised of the below format and this will be repeated in the Signature section of `UserOperation`:
``Address(20bytes) + SignatureType(1byte) + SignatureLength(4bytes) + Signature(arbitrary bytes)``

### SignatureType
SignatureType has 3 main types:
1. SignatureType ``1`` : Sign the raw UserOpHash + also supports contract signature(EIP-1271)
2. SignatureType ``2`` : Pre-approved hash
3. SignatureType ``3`` : Sign the ethSignedMessageHash(EIP-191) of UserOpHash + also supports contract signature(EIP-1271)