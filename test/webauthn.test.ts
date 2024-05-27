import * as webauthn from "./utils/webauthn"
import { expect } from "chai"

describe('Webauthn utils tests', () => {

    it("Should extract Q values from the attestation object", async () => {
        const attestationObject = "a363666d74646e6f6e656761747453746d74a068617574684461746158a4f95bc73828ee210f9fd3bbe72d97908013b0a3759e9aea3d0ae318766cd2e1ad4500000000adce000235bcc60a648b0b25f1f055030020c720eb493e167ce93183dd91f5661e1004ed8cc1be23d3340d92381da5c0c80ca5010203262001215820a620a8cfc88fd062b11eab31663e56cad95278bef612959be214d98779f645b82258204e7b905b42917570148b0432f99ba21f2e7eebe018cbf837247e38150a89f771"
        const q = await webauthn.getPublicKey(attestationObject)
        expect(q[0]).to.equal("0xa620a8cfc88fd062b11eab31663e56cad95278bef612959be214d98779f645b8")
        expect(q[1]).to.equal("0x4e7b905b42917570148b0432f99ba21f2e7eebe018cbf837247e38150a89f771")
        expect(q.length).to.equal(2)
    })

    it("Should extract R and S values from the signature", async () => {
        const signature = "3046022100db421231f23d0320dbb8f1284b600cd34b8e9218628139539ff4f1f6c05495da022100ff715aab70d5317dbf8ee224eb18bec3120cfb9db1000dbb31eadaf96c71c1b1"
        const rs = await webauthn.getRSValues(signature)
        expect(rs[0]).to.equal("0xdb421231f23d0320dbb8f1284b600cd34b8e9218628139539ff4f1f6c05495da")
        expect(rs[1]).to.equal("0xff715aab70d5317dbf8ee224eb18bec3120cfb9db1000dbb31eadaf96c71c1b1")
        expect(rs.length).to.equal(2)
    })
})